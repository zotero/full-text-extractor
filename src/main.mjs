import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { extractFulltext } from "../pdf-worker/src/index.js";
import { SQSClient, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import fetch from 'node-fetch';
import config from "config";
const s3Client = new S3Client({ region: "us-east-1" });
const sqsClient = new SQSClient();
const queueURL = config.get('fullTextExtractorSQSUrl');

export const main = async (event) => {
	// Read message from SQS
	for (let record of event.Records) {
		const body = JSON.parse(record.body);
		if (!body.fileName || !body.itemKey || (!body.userID && !body.groupID)) {
			throw new Error("Required input parameter missing from event body: ", event.Records[0].body);
		}
		// SQS event has either userID or groupID parameter, decide which one we use
		const urlComponent = body.userID ? "users" : "groups";
		const urlId = body.userID || body.groupID;
	
		var getCommandParams = {
			Bucket: config.s3Bucket,
			Key: body.fileName
		};
		// Get file from S3
		const s3Response = await s3Client.send(new GetObjectCommand(getCommandParams));
		const data = await s3Response.Body.transformToByteArray();
		// Run PDF-worked
		const extractedFullText = await extractFulltext(data);
	
		// Hit users|groups/{id}/items/:objectKey/fulltext endpoint of dataserver with 3 retries
		let success = false;
		let attempts = 0;
		let response;
		while (!success && attempts < 3) {
			try {
				const url = config.apiURLPrefix + `${urlComponent}/${urlId}/items/${body.itemKey}/fulltext`;
				response = await fetch(url, {
					method: 'put',
					body: JSON.stringify({ content: extractedFullText.text }),
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Basic ' + Buffer.from(config.rootUsername + ":" + config.rootPassword).toString('base64')
					}
				});
				success = true;
			}
			catch (e) {
				console.log(e);
				await new Promise(r => setTimeout(r, 2000));
				attempts += 1;
			}
		}
	
		// If we didn't succeed, skip to the next message in a batch
		if (!success || response.status != 204) {
			let message = "";
			if (response) {
				message += `Status: ${response.status}|`;
				message += await response.text();
			}
			console.log(`Request to dataserver failed. MessageId: ${body.messageId}. ${message}`);
			continue;
		}
		// If we got here, the message was processed successfully
		// So it is deleted from the queueu
		let deleteCommand = new DeleteMessageCommand({
			QueueUrl: queueURL,
			ReceiptHandle: record.receiptHandle
		});
		await sqsClient.send(deleteCommand);
	}
};
