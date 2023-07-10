import {deleteObject, getObject, putObject} from './objectUtils';
import {IExternalNotify, IPersistSerializer, IStoreProcessor, StorageDriver} from 'tachyon-drive';
import {S3Client, S3ClientConfig} from '@aws-sdk/client-s3';
import {AwsCredentialIdentity} from '@aws-sdk/types';
import type {ILoggerLike} from '@avanio/logger-like';

/**
 * The Tachyon driver configuration object for the AWS S3 storage driver with bucket and key.
 */
export type ClientConfigObject = {client: S3ClientConfig; awsBucket: string; awsKey: string};

type ClientConfig = ClientConfigObject | URL;

type ConfigOrAsyncConfig = ClientConfig | Promise<ClientConfig> | (() => ClientConfig | Promise<ClientConfig>);

/**
 * Utility function to build a ClientConfigObject from a S3ClientConfig, bucket and key.
 */
export function buildClientConfig(client: S3ClientConfig, awsBucket: string, awsKey: string): ClientConfigObject {
	return {client, awsBucket, awsKey};
}

export function urlToClientConfig(url: URL): ClientConfigObject {
	const port = url.port ? `:${url.port}` : '';
	const [awsBucket, awsKey] = url.pathname.slice(1).split('/');
	return buildClientConfig(
		{
			credentials: urlToCreedentials(url),
			endpoint: `${url.protocol}//${url.hostname}${port}`,
			forcePathStyle: url.searchParams.get('forcePathStyle') === 'true',
			region: url.searchParams.get('region') || undefined,
			tls: url.protocol === 'https:',
		},
		awsBucket,
		awsKey,
	);
}

export function urlToCreedentials(url: URL): AwsCredentialIdentity {
	return {
		accessKeyId: url.username,
		secretAccessKey: url.password,
	};
}

/**
 * A storage driver that uses AWS S3 as a backend.
 *
 * @example
 * const driver = new AwsS3StorageDriver('AwsS3StorageDriver', new URL(`http://accessKeyId:secretAccessKey@localhost:9000/bucket/key?forcePathStyle=true&region=us-east-1`), bufferSerializer);
 */
export class AwsS3StorageDriver<Input> extends StorageDriver<Input, Buffer> {
	private _config: ConfigOrAsyncConfig;
	private _awsClient: S3Client | undefined;
	constructor(
		name: string,
		config: ConfigOrAsyncConfig,
		serializer: IPersistSerializer<Input, Buffer>,
		extNotify?: IExternalNotify,
		processor?: IStoreProcessor<Buffer>,
		logger?: ILoggerLike | Console,
	) {
		super(name, serializer, extNotify || null, processor, logger);
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
		await putObject(config.client, config.awsBucket, config.awsKey, buffer);
	}

	protected async handleHydrate(): Promise<Buffer | undefined> {
		try {
			const config = await this.getAwsClient();
			return await getObject(config.client, config.awsBucket, config.awsKey);
		} catch (e) {
			if (e instanceof Error && e.name === 'NoSuchKey') {
				return undefined;
			}
			// istanbul ignore next
			throw e;
		}
	}

	protected async handleClear(): Promise<void> {
		const {client, awsBucket, awsKey} = await this.getAwsClient();
		await deleteObject(client, awsBucket, awsKey);
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
			return urlToClientConfig(value);
		}
		return value;
	}
}
