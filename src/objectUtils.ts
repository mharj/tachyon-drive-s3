import * as stream from 'stream';
import {DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';

export function getObject(client: S3Client, Bucket: string, Key: string): Promise<Buffer> {
	// eslint-disable-next-line no-async-promise-executor
	return new Promise(async (resolve, reject) => {
		const getObjectCommand = new GetObjectCommand({Bucket, Key});

		try {
			const response = await client.send(getObjectCommand);
			// istanbul ignore next
			if (!response.Body) {
				throw new Error('No body');
			}
			// istanbul ignore next
			if (!(response.Body instanceof stream.Readable)) {
				throw new Error('Unknown body type');
			}
			// Store all of data chunks returned from the response data stream
			// into an array then use Array#join() to use the returned contents as a String
			const responseDataChunks: Buffer[] = [];

			// Handle an error while streaming the response body
			response.Body.once('error', (err) => reject(err));

			// Attach a 'data' listener to add the chunks of data to our array
			// Each chunk is a Buffer instance
			response.Body.on('data', (chunk: Buffer) => responseDataChunks.push(chunk));

			// Once the stream has no more data, join the chunks into a string and return the string
			response.Body.once('end', () => resolve(Buffer.concat(responseDataChunks)));
		} catch (err) {
			// Handle the error or throw
			return reject(err);
		}
	});
}

export function putObject(client: S3Client, Bucket: string, Key: string, Body: Buffer) {
	return client.send(
		new PutObjectCommand({
			Bucket,
			Key,
			Body,
		}),
	);
}

export function deleteObject(client: S3Client, Bucket: string, Key: string) {
	return client.send(
		new DeleteObjectCommand({
			Bucket,
			Key,
		}),
	);
}
