# Test Reviewer Assignment Mode

This is a test file to verify that ArgusAI:
1. Only reviews when assigned as a reviewer
2. Only works on allowed repositories

## Test Scenarios

### Scenario 1: No Review Assignment
- Create PR without assigning ArgusAI as reviewer
- Expected: No comment from ArgusAI

### Scenario 2: With Review Assignment
- Assign ArgusAI as reviewer
- Expected: ArgusAI reviews the PR

### Test Code
```javascript
function testFunction() {
  // This function has some issues ArgusAI should catch
  var x = 1;  // Should suggest using const/let
  console.log("test")  // Missing semicolon
  return x
}
```