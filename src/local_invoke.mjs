/* eslint-disable indent */
/**
 * This file is to invoke the main function locally during tests
 * It's needed because SAM doesn't allow to invoke a lambda that is triggered on SQS event.
 */
import { SQSClient, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import config from "config";
import { main } from "./main.mjs";
const sqsClient = new SQSClient();
const queueURL = config.get('sqsURL');

export const localInvoke = async () => {
	const messages = await sqsClient.send(new ReceiveMessageCommand({ QueueUrl: queueURL, MaxNumberOfMessages: 10 }));
	console.log(messages);
	const event = { Records: [] };
	if (!messages.Messages) {
		console.log("No messages");
		return;
	}
	for (let m of messages.Messages) {
		event.Records.push({
			messageId: m.MessageId,
			receiptHandle: m.ReceiptHandle,
			body: m.Body
		});
	}
	await main(event);
};


