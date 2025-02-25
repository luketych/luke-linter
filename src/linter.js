const vscode = require('vscode');
const propertyConfig = require('./propertyConfig.json');

class PropertyLinter {
    constructor() {
        // Match property tags within multiline comments
        this.propertyPattern = /\[\[OPEN:(\w+)\]\]([\s\S]*?)\[\[CLOSE:\1\]\]/g;
        this.functionPattern = /(?:function|class|const|let|var)\s+(\w+)/g;
        this.multilineCommentPattern = /\/\*[\s\S]*?\*\//g;

        // Store default property configuration
        this.defaultConfig = propertyConfig;
        this.propertyConfig = propertyConfig;
    }

    /**
     * Load project-specific configuration if available
     * @param {string} documentPath - Path to the current document
     */
    async loadProjectConfig(documentPath) {
        try {
            // Find the workspace folder containing this document
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(documentPath));
            if (!workspaceFolder) {
                this.propertyConfig = this.defaultConfig;
                return;
            }

            // Try to read project-specific config
            const configPath = vscode.Uri.file(`${workspaceFolder.uri.fsPath}/.luke-linter.json`);
            try {
                const configFile = await vscode.workspace.fs.readFile(configPath);
                const projectConfig = JSON.parse(configFile.toString());

                // Merge project config with defaults
                this.propertyConfig = {
                    properties: {
                        ...this.defaultConfig.properties,
                        ...projectConfig.properties
                    },
                    scopes: {
                        ...this.defaultConfig.scopes,
                        ...projectConfig.scopes
                    }
                };
            } catch (error) {
                // If no project config found, use defaults
                this.propertyConfig = this.defaultConfig;
            }
        } catch (error) {
            console.error('Error loading project config:', error);
            this.propertyConfig = this.defaultConfig;
        }
    }

    /**
     * Get the first multiline comment in the text
     * @param {string} text - The text to search
     * @returns {Object|null} The comment match or null if none found
     */
    getFirstComment(text) {
        const match = text.match(this.multilineCommentPattern);
        return match ? match[0] : null;
    }

    /**
     * Get the immediate multiline comment before a position
     * @param {string} text - The text to search
     * @param {number} position - The position to look before
     * @returns {Object|null} The comment match or null if none found
     */
    getCommentBeforePosition(text, position) {
        // Get the text before the position
        const textBefore = text.substring(0, position);

        // Find all multiline comments
        const comments = [...textBefore.matchAll(this.multilineCommentPattern)];

        // Get the last comment that appears immediately before the position
        // (only whitespace allowed between comment and position)
        if (comments.length > 0) {
            const lastComment = comments[comments.length - 1];
            const textBetween = text.substring(lastComment.index + lastComment[0].length, position).trim();
            if (textBetween === '') {
                return lastComment[0];
            }
        }
        return null;
    }

    /**
     * Parse property tags from text
     * @param {string} text - The text to parse
     * @returns {Object[]} Array of found properties with their locations
     */
    parseProperties(text) {
        const properties = [];
        let match;

        while ((match = this.propertyPattern.exec(text)) !== null) {
            properties.push({
                tag: match[1],
                content: match[2].trim(),
                start: match.index,
                end: match.index + match[0].length
            });
        }

        return properties;
    }

    /**
     * Find function declarations in text
     * @param {string} text - The text to analyze
     * @returns {Object[]} Array of found functions with their locations
     */
    findFunctions(text) {
        const functions = [];
        let match;

        while ((match = this.functionPattern.exec(text)) !== null) {
            functions.push({
                name: match[1],
                start: match.index,
                end: match.index + match[0].length,
                commentBlock: this.getCommentBeforePosition(text, match.index)
            });
        }

        return functions;
    }

    /**
     * Validate properties against configuration rules
     * @param {Object[]} properties - Array of found properties
     * @param {string} scope - Scope to validate against ('file' or 'function')
     * @returns {vscode.Diagnostic[]} Array of diagnostics
     */
    validateProperties(properties, scope) {
        const diagnostics = [];
        const foundTags = new Set(properties.map(p => p.tag));
        const requiredTags = this.propertyConfig.scopes[scope].filter(
            tag => this.propertyConfig.properties[tag].required
        );

        // Check for missing required tags
        for (const tag of requiredTags) {
            if (!foundTags.has(tag)) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 0),
                    `Missing required ${tag} property in ${scope} scope`,
                    this.getSeverity(this.propertyConfig.properties[tag].severity)
                ));
            }
        }

        // Validate existing tags
        for (const prop of properties) {
            const config = this.propertyConfig.properties[prop.tag];

            // Check if property is valid for this scope
            if (!this.propertyConfig.scopes[scope].includes(prop.tag)) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(0, prop.start, 0, prop.end),
                    `Property ${prop.tag} is not valid in ${scope} scope`,
                    vscode.DiagnosticSeverity.Error
                ));
                continue;
            }

            // Check content is not empty
            if (!prop.content.trim()) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(0, prop.start, 0, prop.end),
                    `Empty content for ${prop.tag} property`,
                    this.getSeverity(config.severity)
                ));
            }
        }

        return diagnostics;
    }

    /**
     * Convert severity string to VSCode DiagnosticSeverity
     * @param {string} severity - Severity level from config
     * @returns {vscode.DiagnosticSeverity} VSCode severity level
     */
    getSeverity(severity) {
        switch (severity.toLowerCase()) {
            case 'error':
                return vscode.DiagnosticSeverity.Error;
            case 'warning':
                return vscode.DiagnosticSeverity.Warning;
            case 'info':
                return vscode.DiagnosticSeverity.Information;
            default:
                return vscode.DiagnosticSeverity.Hint;
        }
    }
}

module.exports = PropertyLinter; 