# Luke Linter

A VSCode extension that enforces structured documentation through property tags in your code. This linter ensures consistent documentation by requiring and validating specific properties in your files and functions.

## Features

- Enforces structured documentation through property tags
- Supports both file-level and function-level documentation
- Configurable property requirements and severity levels
- Real-time linting with VSCode's Problems panel integration
- Support for custom properties and rules

## Property Tags Format

Properties are defined using special tags in the following format:
```
[[OPEN:propertyName]]
Your content here
[[CLOSE:propertyName]]
```

### Example File Documentation

```javascript
[[OPEN:author]]
John Doe
[[CLOSE:author]]

[[OPEN:description]]
This file contains utility functions for data processing.
[[CLOSE:description]]

// Rest of your code...
```

### Example Function Documentation

```javascript
[[OPEN:description]]
Calculates the sum of two numbers
[[CLOSE:description]]

[[OPEN:params]]
- a: first number to add
- b: second number to add
[[CLOSE:params]]

[[OPEN:returns]]
The sum of a and b
[[CLOSE:returns]]

[[OPEN:example]]
const result = add(5, 3); // returns 8
[[CLOSE:example]]

function add(a, b) {
    return a + b;
}
```

## Default Properties

### File-Level Properties

| Property | Required | Severity | Description |
|----------|----------|----------|-------------|
| author | Yes | Error | The author of the code |
| description | Yes | Error | A description of what the code does |

### Function-Level Properties

| Property | Required | Severity | Description |
|----------|----------|----------|-------------|
| description | Yes | Error | A description of what the function does |
| params | No | Warning | Function parameters documentation |
| returns | No | Warning | Function return value documentation |
| example | No | Info | Usage example |

## Commands

- `Luke Linter: Check Current Document` - Manually trigger linting on the current file
- `Luke Linter: Check Entire Workspace` - Run the linter on all files in the workspace
- `Luke Linter: Add File Properties` - Insert a template for file-level properties
- `Luke Linter: Add Function Properties` - Insert a template for function-level properties
- `Luke Linter: Show Property Configuration` - Display the current property configuration

## Extension Settings

This extension contributes the following settings:

- `lukeLinter.enableLinting`: Enable/disable the linter (default: true)
- `lukeLinter.fileTypes`: File types to enable linting for (default: [".js", ".ts", ".jsx", ".tsx", ".py"])
- `lukeLinter.ignorePatterns`: Patterns to ignore when linting (default: ["node_modules/**", "dist/**", "build/**"])
- `lukeLinter.customProperties`: Define custom properties with their requirements

### Custom Properties Configuration

You can define custom properties in your VSCode settings:

```json
{
    "lukeLinter.customProperties": {
        "complexity": {
            "required": false,
            "description": "Complexity analysis of the code",
            "severity": "info"
        },
        "deprecated": {
            "required": false,
            "description": "Deprecation notice",
            "severity": "warning"
        }
    }
}
```

## Requirements

- VSCode 1.86.0 or higher

## Installation

1. Open VSCode
2. Press `Ctrl+P` (Windows/Linux) or `Cmd+P` (macOS)
3. Type `ext install luke-linter`
4. Press Enter

## Contributing

Found a bug or have a feature request? Please open an issue on our [GitHub repository](https://github.com/yourusername/luke-linter).

## License

This extension is licensed under the MIT License.
