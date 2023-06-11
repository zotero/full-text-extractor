import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { extractFulltext } from "../pdf-worker/src/index.js";
import fetch from 'node-fetch';
import config from "config";
const s3Client = new S3Client({ region: "us-east-1" });

export const main = async function (event) {
	let batchItemFailures = [];
	// Read message from SQS.
	for (let record of event.Records) {
		const body = JSON.parse(record.body);
		if (!body.fileName || !body.itemKey || (!body.userID && !body.groupID)) {
			// If the event doesn't have right parameters, just skip it to not snowball the queue
			console.log("Required input parameter missing from event body: ", event.Records[0].body);
			continue;
		}
		// SQS event has either userID or groupID parameter, decide which one we use
		const urlComponent = body.userID ? "users" : "groups";
		const urlId = body.userID || body.groupID;
	
		var getCommandParams = {
			Bucket: config.s3Bucket,
			Key: body.fileName
		};
		try {
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
					attempts += 1;
					if (attempts < 3) {
						await new Promise(r => setTimeout(r, 2000));
					}
				}
			}
	
			// If we didn't succeed, throw an error
			if (!success || response.status != 204) {
				let message = "";
				if (response) {
					message += `Status: ${response.status}|`;
					message += await response.text();
				}
				throw new Error(`Request to dataserver failed. ${message}`);
			}
		}
		catch (e) {
			// If an unexpected error is encountered, add it to batchItemFailures array
			console.log(`Exception: ${e}. MessageId: ${record.messageId}`);
			batchItemFailures.push({ itemIdentifier: record.messageId });
		}
	}
	// batchItemFailures are events from the batch that will be retried.
	return { batchItemFailures: batchItemFailures };
};
