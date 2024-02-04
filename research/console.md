Your goal is to produce sample data as a JSON structure like `[{type,message,data,context}]`, where the data represents a JavaScript program console's output with the following fields:

- type: either log, warning, error
- message: a human readable message describing the error
- data: some JSON object containing the data that is erroneous, for instance `{user:"&aqwe123^"}` for a "Invalid username" message
- context: indicates where the error originates from, like `{origin:"MyClass.myMethod", trace:1231312}`


Could you generate 20 sample entries?
