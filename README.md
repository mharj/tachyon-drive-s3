# tachyon-drive-s3

## Overview

This package provides an implementation of the Tachyon Drive `StorageDriver` interface from the `tachyon-drive` package that uses AWS S3 as the underlying storage provider.

## Installation

To install this package, run the following command:

```bash
npm install tachyon-drive-s3
```

## Usage
Usage
To use this package, you first need to create an instance of the AwsS3StorageDriver class, passing in the following parameters:

 - name: A string that identifies the driver instance.
 - url: A URL object that specifies the S3 bucket and key prefix to use for storing data.
 - serializer: A function that converts data to and from a buffer.
 - processor: Optional function that processes data before it is stored and after it is retrieved.

### Initialize simple JSON AWS S3 storage driver

```typescript
const driver = new AwsS3StorageDriver(
	'AwsS3StorageDriver',
	new URL(`http://accessKeyId:secretAccessKey@localhost:9000/bucket/key?forcePathStyle=true&region=us-east-1`),
	bufferSerializer,
);
```

### see more on NPMJS [tachyon-drive](https://www.npmjs.com/package/tachyon-drive)