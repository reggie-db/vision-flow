# Vision Flow demo talk track

## Slide 1: Daily lottery receipt audit

A customer needed to audit lottery receipts before submitting the day's records to the state. Employees reviewed each receipt and entered the required details by hand. That took time and made ordinary data-entry mistakes hard to catch.

The first version of this demo focused on that job. A user captures a receipt, the app checks that it is the expected document, and a longer pass extracts the state, dates, line items, quantities, and amounts. Each field includes a confidence score so the reviewer can focus on uncertain results.

## Slide 2: The same question for other documents

Once we discussed the receipt flow, the customer asked whether the same approach could verify an ID card or confirm that a document had been signed.

Those documents contain different fields, but the work is similar. Confirm the document type, collect specific information, and send uncertain results to a person for review.

Building a separate application for every document would repeat most of the same work. The part that changes is the description of what the document should contain and what the customer wants to collect.

## Slide 3: Two uses of AI

The demo uses AI in two places.

First, AI reads an image and returns structured data. This is the familiar vision use case.

Second, AI creates the structure that controls the experience. A user describes the document and the fields they need. The app turns that prompt into the collection definition, extraction instructions, dashboard view, and Genie context.

The user is not limited to a schema that a developer wrote in advance. The prompt creates a new working flow.

## Slide 4: A prompt creates the flow

For a lottery receipt, the prompt might say: "Collect the state, transaction date, ticket details, quantities, and total amount."

Vision Flow uses that request to define the fields, configure the quick document check and detailed extraction, and prepare the dashboard and Genie experience.

This is the main point of the demo. AI does not only convert an image into structured output. It also generates the structure used to collect and display that output.

## Slide 5: Image to dashboard and Genie

After the flow exists, the runtime path is short.

The user captures an image. A fast pass confirms that it matches the selected document type. A longer pass extracts the requested fields and assigns confidence scores. The result appears in the dashboard, and Genie can answer questions about the same data.

For the receipt audit, a reviewer can see which submissions need attention before the daily state report goes out. For an ID card or signed document, the fields and checks change, but the path stays the same.
