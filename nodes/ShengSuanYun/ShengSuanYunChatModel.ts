import { IAllExecuteFunctions } from "n8n-workflow";

interface Options {
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    maxTokens?: number;
    responseFormat?: 'text' | 'json_object';
    [key: string]: unknown;
}

interface ISSYCM {
    apiKey: string;
    baseURL: string;
    model: string;
    options?: Options;
    httpRequest: IAllExecuteFunctions['helpers']['httpRequest'];
}

interface IToolCall {
    id: string;
    type: string;
    function: {
        name: string;
        arguments: string;
    };
    index?: number;
}

interface IOpenAIMessage {
    role: string;
    content: string | null;
    tool_calls?: IToolCall[];
    function_call?: unknown;
    tool_call_id?: string;
    name?: string;
}

interface IChatCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message?: IOpenAIMessage; 
        delta?: IOpenAIMessage;   
        finish_reason: string | null;
        logprobs?: unknown;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface IBaseMessage {
    role?: string;
    content: string | Record<string, unknown>;
    tool_call_id?: string;
    name?: string;
    _getType?: () => string;
    tool_calls?: IToolCall[];
}

interface IAIMessage {
    lc: number;
    type: string;
    id: string[];
    kwargs: {
        content: string;
        additional_kwargs: Record<string, unknown>;
        tool_calls: IToolCall[];
    };
    content: string;
    additional_kwargs: Record<string, unknown>;
    tool_calls: IToolCall[];
    usage_metadata?: Record<string, unknown>;
}

interface IRunnableConfig {
    tools?: unknown[];
    bound?: {
        tools?: unknown[];
    };
    [key: string]: unknown;
}

export class ShengSuanYunChatModel {
    apiKey: string;
    baseURL: string;
    model: string;
    options: Options;
    httpRequest: IAllExecuteFunctions['helpers']['httpRequest'];
    
    lc_runnable = true;
    lc_namespace = ['langchain', 'chat_models', 'shengsuanyun'];
    lc_serializable = true;
    name = 'ShengSuanYunChatModel';

    constructor({ apiKey, baseURL, model, options, httpRequest }: ISSYCM) {
        this.apiKey = apiKey;
        this.baseURL = baseURL;
        this.model = model;
        this.options = options || {};
        this.httpRequest = httpRequest;
    }

    _llmType(): string {
        return "shengsuanyun-chat";
    }

    _modelType(): string {
        return "base_chat_model";
    }

    async invoke(input: string | IBaseMessage[] | { messages: IBaseMessage[] }, config?: IRunnableConfig): Promise<IAIMessage> {
        const messages = this._normalizeInput(input);
        const formattedMessages = this._formatMessages(messages);

        const body: Record<string, unknown> = {
            model: this.model,
            messages: formattedMessages,
            temperature: this.options.temperature ?? 0.7,
            top_p: this.options.topP ?? 1,
            presence_penalty: this.options.presencePenalty ?? 0,
            frequency_penalty: this.options.frequencyPenalty ?? 0,
        };

        if (this.options.maxTokens && this.options.maxTokens > 0) {
            body.max_tokens = this.options.maxTokens;
        }

        if (this.options.responseFormat && this.options.responseFormat !== 'text') {
            body.response_format = { type: this.options.responseFormat };
        }

        const tools = config?.tools || config?.bound?.tools;
        if (tools && Array.isArray(tools) && tools.length > 0) {
            body.tools = this._formatTools(tools);
            body.tool_choice = "auto";
        }

        try {
            const res = await this.httpRequest({
                method: 'POST',
                url: `${this.baseURL}/chat/completions`,
                json: true,
                body,
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/shengsuan/n8n-nodes-shengsuanyun',
                    'X-Title': 'n8n-nodes-shengsuanyun',
                },
            }) as IChatCompletionResponse;

            const generation = this._createChatGeneration(res);
            return generation.message;

        } catch (error) {
            throw new Error(`ShengSuanYun API error: ${error}`);
        }
    }

    async *stream(input: string | IBaseMessage[] | { messages: IBaseMessage[] }, config?: IRunnableConfig): AsyncGenerator<IAIMessage> {
        const messages = this._normalizeInput(input);
        const formattedMessages = this._formatMessages(messages);

        const body: Record<string, unknown> = {
            model: this.model,
            messages: formattedMessages,
            stream: true,
            temperature: this.options.temperature ?? 0.7,
            top_p: this.options.topP ?? 1,
            presence_penalty: this.options.presencePenalty ?? 0,
            frequency_penalty: this.options.frequencyPenalty ?? 0,
        };

        if (this.options.maxTokens && this.options.maxTokens > 0) {
            body.max_tokens = this.options.maxTokens;
        }

        if (this.options.responseFormat && this.options.responseFormat !== 'text') {
            body.response_format = { type: this.options.responseFormat };
        }

        const tools = config?.tools || config?.bound?.tools;
        if (tools && Array.isArray(tools) && tools.length > 0) {
            body.tools = this._formatTools(tools);
            body.tool_choice = "auto";
        }

        const response = await this.httpRequest({
            method: 'POST',
            url: `${this.baseURL}/chat/completions`,
            body,
            json: true,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/shengsuan/n8n-nodes-shengsuanyun',
                'X-Title': 'n8n-nodes-shengsuanyun',
            },
            returnFullResponse: true,
        }) as { body: AsyncIterable<Uint8Array> };

        if (!response.body) {
            throw new Error("No stream body returned from server.");
        }

        yield* this._streamIterator(response.body);
    }

    async batch(inputs: Array<string | IBaseMessage[] | { messages: IBaseMessage[] }>, config?: IRunnableConfig): Promise<IAIMessage[]> {
        const results = [];
        for (const input of inputs) {
            const result = await this.invoke(input, config);
            results.push(result);
        }
        return results;
    }

    bindTools(tools: unknown[]): ShengSuanYunChatModel {
        const newModel = new ShengSuanYunChatModel({
            apiKey: this.apiKey,
            baseURL: this.baseURL,
            model: this.model,
            options: this.options,
            httpRequest: this.httpRequest,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (newModel as any).boundTools = tools; 
        return newModel;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    withConfig(config: unknown): this {
        return this;
    }

    pipe(next: unknown): unknown {
        return {
            invoke: async (input: string | IBaseMessage[] | { messages: IBaseMessage[] }, config?: IRunnableConfig) => {
                const result = await this.invoke(input, config);
                return (next as { invoke?: (result: IAIMessage, config?: IRunnableConfig) => unknown })?.invoke 
                    ? (next as { invoke: (result: IAIMessage, config?: IRunnableConfig) => unknown }).invoke(result, config) 
                    : (next as (result: IAIMessage) => unknown)(result);
            },
        };
    }
    
    private _createAIMessage(content: string, additionalKwargs: Record<string, unknown> = {}): IAIMessage {
        const toolCalls = (additionalKwargs.tool_calls as IToolCall[]) || [];
        
        return {
            lc: 1,
            type: "constructor",
            id: ["langchain", "schema", "AIMessage"],
            kwargs: {
                content: content,
                additional_kwargs: additionalKwargs,
                tool_calls: toolCalls,
            },
            content: content,
            additional_kwargs: additionalKwargs,
            tool_calls: toolCalls,
            // @ts-expect-error - _getType is a runtime method used by LangChain for message type identification
            _getType: () => "ai",
        };
    }

    private _createChatGeneration(res: IChatCompletionResponse): { 
        text: string; 
        message: IAIMessage; 
        generationInfo: Record<string, unknown>;
        llmOutput: Record<string, unknown>; 
    } {
        const choice = res.choices?.[0];
        const message = choice?.message ?? { role: 'assistant', content: '' };
        const content = message.content ?? '';
        const additionalKwargs: Record<string, unknown> = {};
        if (message.tool_calls && message.tool_calls.length > 0) {
            additionalKwargs.tool_calls = message.tool_calls;
        }
        
        if (message.function_call) {
            additionalKwargs.function_call = message.function_call;
        }
        const aiMessage = this._createAIMessage(content, additionalKwargs);
        if (res.usage) {
             aiMessage.usage_metadata = res.usage as unknown as Record<string, unknown>;
        }

        return {
            text: content,
            message: aiMessage,
            generationInfo: {
                finish_reason: choice?.finish_reason,
                logprobs: choice?.logprobs,
            },
            llmOutput: {
                tokenUsage: res.usage,
                model: res.model,
            },
        };
    }

    private async *_streamIterator(body: AsyncIterable<Uint8Array>): AsyncGenerator<IAIMessage> {
        const decoder = new TextDecoder();
        let buffer = "";
        const accumulatedToolCalls: IToolCall[] = [];

        for await (const chunk of body) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                if (!line.startsWith("data:")) continue;

                const data = line.replace("data:", "").trim();
                if (data === "[DONE]") {
                    return;
                }

                let json: IChatCompletionResponse;
                try {
                    json = JSON.parse(data);
                } catch {
                    continue;
                }

                const delta = json.choices?.[0]?.delta;
                if (!delta) continue;

                const deltaContent = delta.content ?? "";
                const additionalKwargs: Record<string, unknown> = {};
                if (delta.tool_calls) {
                    additionalKwargs.tool_calls = delta.tool_calls;
                    
                    for (const tc of delta.tool_calls) {
                        const index = tc.index ?? 0;
                        if (!accumulatedToolCalls[index]) {
                            accumulatedToolCalls[index] = {
                                id: tc.id || '',
                                type: tc.type || 'function',
                                function: { name: '', arguments: '' },
                                index: index
                            };
                        }
                        if (tc.function?.name) {
                            accumulatedToolCalls[index].function.name += tc.function.name;
                        }
                        if (tc.function?.arguments) {
                            accumulatedToolCalls[index].function.arguments += tc.function.arguments;
                        }
                    }
                }

                const aiMessage = this._createAIMessage(deltaContent, additionalKwargs);
                yield aiMessage;
            }
        }
    }

    private _normalizeInput(input: string | IBaseMessage[] | { messages: IBaseMessage[] } | unknown): IBaseMessage[] {
        if (Array.isArray(input)) {
            return input as IBaseMessage[];
        }
        if (typeof input === 'string') {
            return [{ role: 'user', content: input }];
        }
        if (typeof input === 'object' && input !== null && 'messages' in input) {
            return (input as { messages: IBaseMessage[] }).messages;
        }
        if (typeof input === 'object' && input !== null && 'content' in input) {
            return [input as IBaseMessage];
        }
        return [{ role: 'user', content: String(input) }];
    }

    private _formatMessages(messages: IBaseMessage[]): IOpenAIMessage[] {
        return messages.map(msg => {
            if (typeof msg._getType === 'function') {
                const type = msg._getType();
                return {
                    role: type === 'human' ? 'user' : 
                          type === 'ai' ? 'assistant' : 
                          type === 'system' ? 'system' : 
                          type === 'tool' ? 'tool' : 'user',
                    content: this._extractContent(msg.content),
                    ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
                    ...(msg.name && { name: msg.name }),
                    ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
                };
            }
            
            if (msg.role && msg.content !== undefined) {
                return {
                    role: msg.role,
                    content: this._extractContent(msg.content),
                    ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
                    ...(msg.name && { name: msg.name }),
                };
            }

            return {
                role: 'user',
                content: this._extractContent(msg),
            };
        });
    }

    private _extractContent(content: unknown): string {
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content.map(c => typeof c === 'string' ? c : JSON.stringify(c)).join('\n');
        }
        return JSON.stringify(content);
    }

    private _formatTools(tools: unknown[]): unknown[] {
        return tools.map((tool: unknown) => {
            const toolObj = tool as Record<string, unknown>;
            if (toolObj.type === 'function' && toolObj.function) {
                return tool;
            }
            return {
                type: "function",
                function: {
                    name: (toolObj.name || (toolObj.function as Record<string, unknown>)?.name) as string,
                    description: (toolObj.description || (toolObj.function as Record<string, unknown>)?.description) as string,
                    parameters: (toolObj.parameters || toolObj.schema || (toolObj.function as Record<string, unknown>)?.parameters || {}) as Record<string, unknown>,
                },
            };
        });
    }

    toJSON(): Record<string, unknown> {
        return {
            _type: this._llmType(),
            model: this.model,
            baseURL: this.baseURL,
        };
    }

    get callKeys(): string[] {
        return ['stop', 'timeout', 'signal', 'tags', 'metadata', 'callbacks', 'tools'];
    }
}
