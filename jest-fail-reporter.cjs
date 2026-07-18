/**
 * Failures-only Jest reporter.
 * Prints only suites/tests that actually failed, plus a compact summary.
 * Run with:  npm run test:fail
 */
'use strict';

class FailReporter {
  onRunComplete(_contexts, results) {
    const { testResults, numFailedTests, numPassedTests, numPendingTests, numTotalTests } = results;

    const failedSuites = testResults.filter(s => s.numFailingTests > 0);

    if (failedSuites.length === 0) {
      console.log(`\n✅  All ${numPassedTests} tests passed.\n`);
      return;
    }

    console.log('\n' + '─'.repeat(72));
    console.log('FAILURES');
    console.log('─'.repeat(72));

    for (const suite of failedSuites) {
      const rel = suite.testFilePath.replace(process.cwd() + '/', '');
      console.log(`\n📄  ${rel}`);

      for (const t of suite.testResults) {
        if (t.status !== 'failed') continue;
        const name = t.ancestorTitles.concat(t.title).join(' › ');
        console.log(`\n  ✗  ${name}`);
        for (const msg of t.failureMessages) {
          // Trim the huge stack — keep first 20 lines
          const lines = msg.split('\n').slice(0, 20).join('\n');
          console.log(lines.replace(/^/gm, '     '));
        }
      }
    }

    console.log('\n' + '─'.repeat(72));
    console.log(
      `SUMMARY  failed: ${numFailedTests}  passed: ${numPassedTests}` +
      (numPendingTests ? `  skipped: ${numPendingTests}` : '') +
      `  total: ${numTotalTests}`
    );
    console.log('─'.repeat(72) + '\n');
  }
}

module.exports = FailReporter;