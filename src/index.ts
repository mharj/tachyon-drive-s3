import {DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client, S3ClientConfig} from '@aws-sdk/client-s3';
import {IPersistSerializer, IStoreProcessor, StorageDriver} from 'tachyon-drive';
import {AwsCredentialIdentity} from '@aws-sdk/types';
import {ILoggerLike} from '@avanio/logger-like';
import stream = require('stream');

type ClientConfigObject = {client: S3ClientConfig; awsBucket: string; awsKey: string};

type ClientConfig = ClientConfigObject | URL;

type ConfigOrAsyncConfig = ClientConfig | Promise<ClientConfig> | (() => ClientConfig | Promise<ClientConfig>);

function urlToConfig(url: URL): ClientConfigObject {
	const port = url.port ? `:${url.port}` : '';
	const [awsBucket, awsKey] = url.pathname.slice(1).split('/');
	return {
		client: {
			credentials: urlToCreedentials(url),
			endpoint: `${url.protocol}//${url.hostname}${port}`,
			forcePathStyle: url.searchParams.get('forcePathStyle') === 'true',
			region: url.searchParams.get('region') || '',
			tls: url.protocol === 'https:',
		},
		awsBucket,
		awsKey,
	};
}

export function urlToCreedentials(url: URL): AwsCredentialIdentity {
	return {
		accessKeyId: url.username,
		secretAccessKey: url.password,
	};
}

function getObject(client: S3Client, Bucket: string, Key: string): Promise<Buffer> {
	// eslint-disable-next-line no-async-promise-executor
	return new Promise(async (resolve, reject) => {
		const getObjectCommand = new GetObjectCommand({Bucket, Key});

		try {
			const response = await client.send(getObjectCommand);
			if (!response.Body) {
				throw new Error('No body');
			}
			if (!(response.Body instanceof stream.Readable)) {
				throw new Error('Unknown body type');
			}
			// Store all of data chunks returned from the response data stream
			// into an array then use Array#join() to use the returned contents as a String
			const responseDataChunks: string[] = [];

			// Handle an error while streaming the response body
			response.Body.once('error', (err) => reject(err));

			// Attach a 'data' listener to add the chunks of data to our array
			// Each chunk is a Buffer instance
			response.Body.on('data', (chunk) => responseDataChunks.push(chunk));

			// Once the stream has no more data, join the chunks into a string and return the string
			response.Body.once('end', () => resolve(Buffer.from(responseDataChunks.join(''))));
		} catch (err) {
			// Handle the error or throw
			return reject(err);
		}
	});
}

export class AwsS3StorageDriver<Input> extends StorageDriver<Input, Buffer> {
	private _config: ConfigOrAsyncConfig;
	private _awsClient: S3Client | undefined;
	constructor(
		name: string,
		config: ConfigOrAsyncConfig,
		serializer: IPersistSerializer<Input, Buffer>,
		processor?: IStoreProcessor<Buffer>,
		logger?: ILoggerLike | Console,
	) {
		super(name, serializer, processor, logger);
		this._config = config;
	}

	protected async handleInit(): Promise<boolean> {
		await this.getAwsClient();
		return true;
	}

	protected async handleUnload(): Promise<boolean> {
		this._awsClient = undefined;
		return true;
	}

	protected async handleStore(buffer: Buffer): Promise<void> {
		const config = await this.getAwsClient();
		await config.client.send(
			new PutObjectCommand({
				Bucket: config.awsBucket,
				Key: config.awsKey,
				Body: buffer,
			}),
		);
	}

	protected async handleHydrate(): Promise<Buffer | undefined> {
		try {
			const config = await this.getAwsClient();
			return await getObject(config.client, config.awsBucket, config.awsKey);
		} catch (e) {
			if (e instanceof Error && e.name === 'NoSuchKey') {
				return undefined;
			}
			throw e;
		}
		throw new Error('Unknown body type');
	}

	protected async handleClear(): Promise<void> {
		const {client, awsBucket, awsKey} = await this.getAwsClient();
		await client.send(new DeleteObjectCommand({Bucket: awsBucket, Key: awsKey}));
	}

	private async getAwsClient(): Promise<{client: S3Client; awsBucket: string; awsKey: string}> {
		const config = await this.getAwsConfig();
		if (!this._awsClient) {
			this._awsClient = new S3Client(config.client);
		}
		return {client: this._awsClient, awsBucket: config.awsBucket, awsKey: config.awsKey};
	}

	private async getAwsConfig(): Promise<ClientConfigObject> {
		const value = await (typeof this._config === 'function' ? await this._config() : this._config);
		if (value instanceof URL) {
			return urlToConfig(value);
		}
		return value;
	}
}
