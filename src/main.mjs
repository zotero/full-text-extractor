import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { extractFulltext } from "../pdf-worker/src/index.js";
import fetch from 'node-fetch';
import config from "config";
const client = new S3Client({ region: "us-east-1" });


export const main = async (event) => {
	// Read message from SQS
	const body = JSON.parse(event.Records[0].body);
	if (!body.fileName || !body.objectKey || (!body.userID && !body.groupID)) {
		throw new Error("Required input parameter missing from event body: ", event.Records[0].body);
	}
	// SQS event has either userID or groupID parameter, decide which one we use
	const urlComponent = body.userID ? "users" : "groups";
	const urlId = body.userID || body.groupID;

	var getCommandParams = {
		Bucket: config.BUCKET,
		Key: body.fileName
	};
	// Get file from S3
	const s3Response = await client.send(new GetObjectCommand(getCommandParams));
	const data = await s3Response.Body.transformToByteArray();
	// Run PDF-worked
	const extractedFullText = await extractFulltext(data);

	// Hit users|groups/{id}/items/:objectKey/fulltext endpoint of dataserver with 3 retries
	let success = false;
	let attempts = 0;
	let response;
	while (!success && attempts < 3) {
		try {
			response = await fetch(config.DATASERVER_URL + `/${urlComponent}/${urlId}/items/${body.objectKey}/fulltext`, {
				method: 'put',
				body: JSON.stringify({ content: extractFulltext.text }),
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

	// Break if we didn't succeed
	if (!success || response.status != 204) {
		let message = "";
		if (response) {
			message += `Status: ${response.status}|`;
			message += await response.text();
		}
		throw new Error(`Request to dataserver failed. ${message}`);
	}
	return extractedFullText;
};
