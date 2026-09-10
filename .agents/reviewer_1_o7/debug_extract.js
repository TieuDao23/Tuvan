const { MultiSyntaxParser } = require('../../suna_agent.js');
const mixedText = `
<think>
I need to inspect the code first.
<suna_tool_call tool="view_file">
{"path": "foo.js"}
</suna_tool_call>
Next I will edit it.
\`\`\`json
{
  "tool": "replace_file_content",
  "args": { "TargetFile": "foo.js", "TargetContent": "old", "ReplacementContent": "new" }
}
\`\`\`
`;

const calls = MultiSyntaxParser.parse(mixedText);
console.log('Calls:', JSON.stringify(calls, null, 2));
