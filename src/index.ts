import * as AWS from 'aws-sdk';
import {IPersistSerializer, IStoreProcessor, StorageDriver} from 'tachyon-drive';
import {ILoggerLike} from '@avanio/logger-like';

type ConfigOrAsyncConfig =
	| AWS.S3.Types.ClientConfiguration
	| Promise<AWS.S3.Types.ClientConfiguration>
	| (() => AWS.S3.Types.ClientConfiguration | Promise<AWS.S3.Types.ClientConfiguration>);

export class AwsS3StorageDriver<Input> extends StorageDriver<Input, Buffer> {
	private _config: ConfigOrAsyncConfig;
	private _awsKey: string;
	private _awsBucket: string;
	private _awsClient: AWS.S3 | undefined;
	constructor(
		name: string,
		awsBucket: string,
		awsKey: string,
		config: ConfigOrAsyncConfig,
		serializer: IPersistSerializer<Input, Buffer>,
		processor?: IStoreProcessor<Buffer>,
		logger?: ILoggerLike | Console,
	) {
		super(name, serializer, processor, logger);
		this._awsKey = awsKey;
		this._awsBucket = awsBucket;
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
		await (await this.getAwsClient()).upload({Bucket: this._awsBucket, Key: this._awsKey, Body: buffer}).promise();
	}

	protected async handleHydrate(): Promise<Buffer | undefined> {
		try {
			const {Body} = await (await this.getAwsClient()).getObject({Bucket: this._awsBucket, Key: this._awsKey}).promise();
			if (!Body) {
				return undefined;
			}
			if (Body instanceof Buffer) {
				return Body;
			}
			if (typeof Body === 'string' || Body instanceof Uint8Array) {
				return Buffer.from(Body);
			}
		} catch (e) {
			if (e instanceof Error && e.name === 'NoSuchKey') {
				return undefined;
			}
			throw e;
		}
		throw new Error('Unknown body type');
	}

	protected async handleClear(): Promise<void> {
		await (await this.getAwsClient()).deleteObject({Bucket: this._awsBucket, Key: this._awsKey}).promise();
	}

	private async getAwsClient(): Promise<AWS.S3> {
		if (!this._awsClient) {
			this._awsClient = new AWS.S3(await this.getAwsConfig());
		}
		return this._awsClient;
	}

	private async getAwsConfig(): Promise<AWS.S3.Types.ClientConfiguration> {
		return typeof this._config === 'function' ? await this._config() : this._config;
	}
}
