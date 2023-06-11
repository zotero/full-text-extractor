/* eslint-disable indent */
/**
 * This file is to invoke the main function locally during tests
 * It's needed because SAM doesn't allow to invoke a lambda that is triggered on SQS event.
 */
import { SQSClient, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import config from "config";
import { main } from "./main.mjs";
const sqsClient = new SQSClient();
const queueURL = config.get('fullTextExtractorSQSUrl');

export const localInvoke = async () => {
	const messages = await sqsClient.send(new ReceiveMessageCommand({ QueueUrl: queueURL, MaxNumberOfMessages: 10 }));
	const event = { Records: [] };
	for (let m of messages?.Messages || []) {
		event.Records.push({
			messageId: m.MessageId,
			receiptHandle: m.ReceiptHandle,
			body: m.Body
		});
	}
	const batchFailures = await main(event);
	console.log(batchFailures);
	return event.Records.length;
};


