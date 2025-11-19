import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class apiKey implements ICredentialType {
	name = 'apiKey';
	displayName = 'ShengSuanYun API Key';
	documentationUrl = 'https://github.com/org/-shengsuanyun?tab=readme-ov-file#credentials';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'Authorization': 'Bearer ={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://router.shengsuanyun.com/api/v1',
			url: '/v1/user',
		},
	};
}
