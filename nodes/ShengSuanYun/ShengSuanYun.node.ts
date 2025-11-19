import { IDataObject, IExecuteFunctions, IHttpRequestMethods, IHttpRequestOptions, ILoadOptionsFunctions, INodeExecutionData, INodePropertyOptions, NodeConnectionTypes, NodeOperationError, type INodeType, type INodeTypeDescription } from 'n8n-workflow';

interface IModel {
	id: string;
	name: string;
	description?: string;
	context_length: number;
	pricing: {
		prompt: string;
		completion: string;
	};
}

interface IResponse extends IDataObject {
	id: string;
	model: string;
	created: number;
	object: string;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
	choices: Array<{
		message: {
			role: string;
			content: string;
		};
		finish_reason: string;
		index: number;
	}>;
}

export class ShengSuanYun implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ShengSuanYun',
		name: 'shengsuanyun',
		icon: { light: 'file:shengsuanyun.svg', dark: 'file:shengsuanyun.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the ShengSuanYun API',
		defaults: { name: 'ShengSuanYun' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'apiKey', required: true }],
		requestDefaults: {
			baseURL: 'https://router.shengsuanyun.com/api/v1',
			headers: {
				Accept: 'application/json',
				'HTTP-Referer': 'https://github.com/shengsuan/n8n-nodes-shengsuanyun',
				'X-Title': 'n8n ShengSuanYun Node',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Chat',
						value: 'chat',
						description: 'Send a chat message',
						action: 'Send a chat message',
					},
				],
				default: 'chat',
			},
			{
				displayName: 'Model Name or ID',
				name: 'model',
				type: 'options',
				noDataExpression: true,
				typeOptions: {
					loadOptionsMethod: 'getModels',
				},
				required: true,
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'System Prompt',
				name: 'system_prompt',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				description: 'System message to set the behavior of the assistant',
				placeholder: 'You are a helpful assistant...',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				description: 'The message to send to the chat model',
				required: true,
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				default: 0.9,
				description: 'What sampling temperature to use',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				options: [
					{
						displayName: 'Frequency Penalty',
						name: 'frequency_penalty',
						type: 'number',
						default: 0,
						description:
							'Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency.',
					},
					{
						displayName: 'Max Tokens',
						name: 'max_tokens',
						type: 'number',
						default: 1000,
						description: 'The maximum number of tokens to generate',
					},
					{
						displayName: 'Presence Penalty',
						name: 'presence_penalty',
						type: 'number',
						default: 0,
						description:
							'Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far.',
					},
					{
						displayName: 'Top P',
						name: 'top_p',
						type: 'number',
						default: 1,
						description:
							'An alternative to sampling with temperature, called nucleus sampling',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const options :IHttpRequestOptions = {
					url: 'https://router.shengsuanyun.com/api/v1/models',
					headers: {
						'HTTP-Referer': 'https://github.com/shengsuan/n8n-nodes-shengsuanyun',
						'X-Title': 'n8n ShengSuanYun Node',
						'Content-Type': 'application/json',
					},
					method: 'GET' as IHttpRequestMethods,
					json: true,
				};

				try {
					const response = await this.helpers.httpRequest(options);
					if (!response?.data || !Array.isArray(response.data)) {
						throw new NodeOperationError(
							this.getNode(),
							'Invalid response format from OpenRouter API',
						);
					}

					const truncateAndAddPricing = (model: IModel): string => {
						const originalDescription = model.description || '';
						const truncatedDescription = originalDescription.slice(0, Math.floor(originalDescription.length / 2));
						const pricing = `Price: $${parseFloat(model.pricing.prompt) * 1000000}/1M tokens (prompt), $${parseFloat(model.pricing.completion) * 1000000}/1M tokens (completion)`;
						const combinedDescription = `${truncatedDescription} ${pricing}`.trim();
						return combinedDescription.length > originalDescription.length
							? combinedDescription.slice(0, originalDescription.length - 3) + '...'
							: combinedDescription;
					};

					const models = response.data
						.filter((model: IModel) => model.id && model.name)
						.map((model: IModel) => ({
							name: model.name,
							value: model.id,
							description: truncateAndAddPricing(model),
						}))
						.sort((a: INodePropertyOptions, b: INodePropertyOptions) =>
							a.name.localeCompare(b.name),
						);

					if (models.length === 0) {
						throw new NodeOperationError(
							this.getNode(),
							'No models found in OpenRouter API response',
						);
					}

					return models;
				} catch (error) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to load models: ${(error as Error).message}`,
					);
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('apiKey');
		if (!credentials?.apiKey) {
			throw new NodeOperationError(this.getNode(), 'No valid API key provided');
		}

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				const model = this.getNodeParameter('model', i) as string;
				const systemPrompt = this.getNodeParameter('system_prompt', i, '') as string;
				const message = this.getNodeParameter('message', i) as string;
				const temperature = this.getNodeParameter('temperature', i) as number;
				const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

				if (operation === 'chat') {
					const messages = [];
					if (systemPrompt) {
						messages.push({ role: 'system', content: systemPrompt });
					}
					messages.push({ role: 'user',content: message });
					const requestBody = { model, messages, temperature, ...additionalFields };
					const options :IHttpRequestOptions = {
						url: 'https://router.shengsuanyun.com/api/v1/chat/completions',
						headers: {
							Authorization: `Bearer ${credentials.apiKey}`,
							'HTTP-Referer': 'https://github.com/shengsuan/n8n-nodes-shengsuanyun',
							'X-Title': 'n8n ShengSuanYun Node',
							'Content-Type': 'application/json',
						},
						method: 'POST' as IHttpRequestMethods,
						body: requestBody,
						json: true,
					};

					const response = await this.helpers.httpRequest(options);
					if (!response?.choices?.[0]?.message?.content) {
						throw new NodeOperationError(
							this.getNode(),
							'Invalid response format from ShengSuanYun API',
						);
					}
					const typedResponse = response as IResponse;
					const messageContent = typedResponse.choices[0].message.content.trim();
					returnData.push({
						json: { response: messageContent },
						pairedItem: { item: i },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}
		return [returnData];
	}
}
