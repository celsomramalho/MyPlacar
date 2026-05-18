const { run } = require('dependency-cruiser');
const fs = require('fs');

const result = run(
  ['src'],
  {
    validate: true,
    ruleSet: { forbidden: [] },
    outputType: 'json',
    includeOnly: '^src'
  }
);

fs.writeFileSync('violations-raw.json', result.output, 'utf8');
console.log('Done. Characters written:', result.output.length);
