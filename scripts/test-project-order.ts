import {
  mergeProjectOrder,
  moveIdBefore,
} from '../src/lib/cpwProjectOrder'

let failures = 0
function check(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`ok   ${label}`)
  } else {
    failures++
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`)
  }
}
const items = (ids: string[]): { id: string }[] => ids.map(id => ({ id }))

// mergeProjectOrder: saved order first, new items appended (file order), missing dropped, dups ignored
check(mergeProjectOrder(items(['a', 'b', 'c']), ['c', 'a', 'b']).map(i => i.id), ['c', 'a', 'b'], 'saved order applied')
check(mergeProjectOrder(items(['a', 'b', 'c', 'd']), ['c', 'a']).map(i => i.id), ['c', 'a', 'b', 'd'], 'new items appended in file order')
check(mergeProjectOrder(items(['a', 'b']), ['x', 'b', 'a']).map(i => i.id), ['b', 'a'], 'missing saved ids dropped')
check(mergeProjectOrder(items(['a', 'b', 'c']), []).map(i => i.id), ['a', 'b', 'c'], 'empty order = file order')
check(mergeProjectOrder(items(['a', 'b']), ['a', 'a', 'b']).map(i => i.id), ['a', 'b'], 'duplicate saved ids ignored')

// moveIdBefore: reorder helper
check(moveIdBefore(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b'], 'move c before a')
check(moveIdBefore(['a', 'b', 'c'], 'a', null), ['b', 'c', 'a'], 'move a to end')
check(moveIdBefore(['a', 'b', 'c'], 'a', 'a'), ['a', 'b', 'c'], 'move before self = no-op')
check(moveIdBefore(['a', 'b', 'c'], 'a', 'z'), ['a', 'b', 'c'], 'unknown target = no-op')
check(moveIdBefore(['a', 'b', 'c'], 'b', 'a'), ['b', 'a', 'c'], 'move b before a')

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`)
  process.exit(1)
}
console.log('\nAll project-order tests passed')
