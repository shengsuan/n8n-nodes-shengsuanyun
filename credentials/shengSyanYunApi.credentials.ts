import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class shengSyanYunApi implements ICredentialType {
	name = 'shengSyanYunApi';
	displayName = 'ShengSuanYun API';
	documentationUrl = 'https://docs.router.shengsuanyun.com/7013961m0';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
		},
		{
			displayName: 'Base URL',
			name: 'url',
			type: 'string',
			typeOptions: { password: false },
			required: false,
			default: 'https://router.shengsuanyun.com/api/v1',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://router.shengsuanyun.com/api/v1',
			url: '/models',
		},
	};
}
