t=open('test/stores.test.js').read()
a="""  assert.equal(normalizeRegex(42), '');
});"""
assert a in t,'T'
n="""  assert.equal(normalizeRegex(42), '');
});

test('normalizeRegex: catastrophic-backtracking shapes rejected, common patterns kept', () => {
  assert.equal(normalizeRegex('(a+)+$'), '', 'nested quantifier rejected');
  assert.equal(normalizeRegex('(\\\\w+\\\\.)+$'), '', 'quantified group with inner quantifier rejected');
  assert.equal(normalizeRegex('(a|aa)+$'), '', 'unbounded quantifier over alternation rejected');
  assert.equal(normalizeRegex('((a+)+b)+c'), '', 'deep nesting caught by recursion');
  assert.equal(normalizeRegex('(^|\\\\.)ads?\\\\.'), '(^|\\\\.)ads?\\\\.', 'common sinkhole pattern kept');
  assert.equal(normalizeRegex('(www)?\\\\.example\\\\.com$'), '(www)?\\\\.example\\\\.com$', 'plain optional group kept');
  assert.equal(normalizeRegex('(^|\\\\.)(ads|tracker)\\\\.'), '(^|\\\\.)(ads|tracker)\\\\.', 'alternation without outer quantifier kept');
  assert.equal(normalizeRegex('[*+]+'), '[*+]+', 'quantified char class kept');
  assert.equal(normalizeRegex('\\\\(a\\\\+\\\\)+'), '\\\\(a\\\\+\\\\)+', 'escaped parens are literals');
});"""
open('test/stores.test.js','w').write(t.replace(a,n)); print('P2 OK')
