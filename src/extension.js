const vscode = require('vscode');
const PropertyLinter = require('./linter');

// Create diagnostic collection
let diagnosticCollection;
const linter = new PropertyLinter();

// This will store our decoration type
let testDecorationType;

// Store tags that should be folded
let globalFoldState = new Set();

// Simplified marker pattern
const REGION_PATTERN = {
    // Matches: // #region [[OPEN:tag]]
    START: /\/\/ #region \[\[OPEN:(\w+)\]\]/g,

    // Matches: // #endregion [[CLOSE:tag]]
    END: /\/\/ #endregion \[\[CLOSE:(\w+)\]\]/g,

    // Matches complete region including content
    FULL: /\/\/ #region \[\[OPEN:(\w+)\]\][\s\S]*?\/\/ #endregion \[\[CLOSE:\1\]\]/g
};

// Add these helper functions before the activate function
async function foldAll(editor) {
    if (!editor) return;

    const text = editor.document.getText();
    const regions = [];
    let match;

    while ((match = REGION_PATTERN.START.exec(text)) !== null) {
        const lineNumber = editor.document.positionAt(match.index).line;
        regions.push(lineNumber);
    }

    if (regions.length > 0) {
        await vscode.commands.executeCommand('editor.fold', {
            selectionLines: regions
        });
    }
}

async function foldSpecificTag(editor, tag) {
    if (!editor) return;

    const text = editor.document.getText();
    const regions = [];
    const tagRegex = new RegExp(`\\/\\/ #region \\[\\[OPEN:${tag}\\]\\]`, 'g');
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
        const lineNumber = editor.document.positionAt(match.index).line;
        regions.push(lineNumber);
    }

    if (regions.length > 0) {
        await vscode.commands.executeCommand('editor.fold', {
            selectionLines: regions
        });
    }
}

async function foldAllInFile(document) {
    const editor = await vscode.window.showTextDocument(document);
    await foldAll(editor);
}

async function unfoldAllInFile(document) {
    const editor = await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('editor.unfoldAll');
}

/**
 * Analyze the document and update diagnostics
 * @param {vscode.TextDocument} document 
 */
async function analyzeDiagnostics(document) {
    // Check if linting is enabled
    const config = vscode.workspace.getConfiguration('lukeLinter');
    if (!config.get('enableLinting')) {
        return;
    }

    // Check if file type should be linted
    const fileTypes = config.get('fileTypes');
    const fileExtension = '.' + document.fileName.split('.').pop();
    if (!fileTypes.includes(fileExtension)) {
        return;
    }

    // Check if file should be ignored
    const ignorePatterns = config.get('ignorePatterns');
    if (ignorePatterns.some(pattern =>
        new RegExp(pattern.replace(/\*/g, '.*').replace(/[.+?^${}()|[\]\\]/g, '\\$&')).test(document.fileName))) {
        return;
    }

    // Load project-specific configuration if available
    await linter.loadProjectConfig(document.fileName);

    const text = document.getText();
    const diagnostics = [];

    // Get file-level properties from first comment block
    const firstComment = linter.getFirstComment(text);
    if (firstComment) {
        const fileProperties = linter.parseProperties(firstComment);
        const fileDiagnostics = linter.validateProperties(fileProperties, 'file');

        // Adjust diagnostic ranges to point to the actual location in the first comment
        const commentStart = text.indexOf(firstComment);
        for (const diagnostic of fileDiagnostics) {
            const startPos = document.positionAt(commentStart + diagnostic.range.start.character);
            const endPos = document.positionAt(commentStart + diagnostic.range.end.character);
            diagnostic.range = new vscode.Range(startPos, endPos);
        }

        diagnostics.push(...fileDiagnostics);
    } else {
        // If no first comment block found, add diagnostic for missing file properties
        diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            'Missing file-level properties block (including masterFormula)',
            vscode.DiagnosticSeverity.Error
        ));
    }

    // Find functions and validate their properties
    const functions = linter.findFunctions(text);
    for (const func of functions) {
        if (func.commentBlock) {
            // Only validate properties found in this specific comment block
            const functionProperties = linter.parseProperties(func.commentBlock);
            const functionDiagnostics = linter.validateProperties(functionProperties, 'function');

            // Adjust diagnostic ranges to point to the actual location in the comment
            const commentStart = text.indexOf(func.commentBlock);
            for (const diagnostic of functionDiagnostics) {
                const startPos = document.positionAt(commentStart + diagnostic.range.start.character);
                const endPos = document.positionAt(commentStart + diagnostic.range.end.character);
                diagnostic.range = new vscode.Range(startPos, endPos);
            }

            diagnostics.push(...functionDiagnostics);
        } else {
            // If no comment block found before function, add diagnostic
            const funcPos = document.positionAt(func.start);
            diagnostics.push(new vscode.Diagnostic(
                new vscode.Range(funcPos, funcPos),
                `Missing property block for function "${func.name}" (including masterFormula)`,
                vscode.DiagnosticSeverity.Error
            ));
        }
    }

    // Update diagnostics
    diagnosticCollection.set(document.uri, diagnostics);
}

/**
 * Check all files in the workspace
 */
async function checkWorkspace() {
    const config = vscode.workspace.getConfiguration('lukeLinter');
    const fileTypes = config.get('fileTypes');
    const pattern = `**/*{${fileTypes.join(',')}}`;

    const files = await vscode.workspace.findFiles(pattern, '{' + config.get('ignorePatterns').join(',') + '}');
    let checkedCount = 0;
    let problemCount = 0;

    for (const file of files) {
        try {
            const document = await vscode.workspace.openTextDocument(file);
            await analyzeDiagnostics(document);
            checkedCount++;

            // Count problems for this file
            const diagnostics = diagnosticCollection.get(document.uri) || [];
            problemCount += diagnostics.length;
        } catch (error) {
            console.error(`Error processing file ${file.fsPath}:`, error);
        }
    }

    vscode.window.showInformationMessage(
        `Workspace check complete: ${checkedCount} files checked, ${problemCount} problems found`
    );
}

/**
 * Add master formula to text
 * @returns {string} The master formula text
 */
function getMasterFormula() {
    return `▽ = ⨍(⏵▷, τ𝑡, ⌬ⵣ, ↯〰⥂⥮, ☀♬⨳❄, eℰ∈∃, ⍨☯, Ψ?⍰⸮, ℳ⚖)`;
}

/**
 * Add file-level property template at cursor position
 * @param {vscode.TextEditor} editor 
 */
async function addFileProperties(editor) {
    if (!editor) {
        return;
    }

    const template = `/*
${getMasterFormula()}
[[OPEN:author]]
Your Name
[[CLOSE:author]]

[[OPEN:description]]
Description of this file
[[CLOSE:description]]
*/

`;

    await editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.start, template);
    });
}

/**
 * Add function-level property template at cursor position
 * @param {vscode.TextEditor} editor 
 */
async function addFunctionProperties(editor) {
    if (!editor) {
        return;
    }

    const template = `/*
${getMasterFormula()}
[[OPEN:description]]
Description of what this function does
[[CLOSE:description]]

[[OPEN:params]]
List of parameters and their descriptions
[[CLOSE:params]]

[[OPEN:returns]]
Description of return value
[[CLOSE:returns]]

[[OPEN:example]]
Usage example
[[CLOSE:example]]
*/

`;

    await editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.start, template);
    });
}

/**
 * Add master formula to all functions and files in the document
 * @param {vscode.TextEditor} editor 
 */
async function addMasterFormula(editor) {
    if (!editor) {
        return;
    }

    const document = editor.document;
    const text = document.getText();
    const linter = new PropertyLinter();
    const functions = linter.findFunctions(text);
    const edits = new vscode.WorkspaceEdit();
    const formula = getMasterFormula();

    // Add to file header if it doesn't have one
    const firstComment = linter.getFirstComment(text);
    if (!firstComment) {
        // No comment block exists, create a new one
        const position = new vscode.Position(0, 0);
        edits.insert(document.uri, position, `/*\n${formula}\n*/\n\n`);
    } else if (!firstComment.includes('masterFormula') && !firstComment.includes(formula)) {
        // Comment block exists but no master formula, add it at the start of the block
        const commentStart = document.positionAt(text.indexOf(firstComment));
        const insertPos = commentStart.translate(1, 0); // After the /* line
        edits.insert(document.uri, insertPos, formula + '\n\n');
    }

    // Add to each function if it doesn't have one
    for (const func of functions) {
        if (func.commentBlock && !func.commentBlock.includes('masterFormula') && !func.commentBlock.includes(formula)) {
            // If function has a comment block but no master formula, add it at the start
            const commentStart = document.positionAt(text.indexOf(func.commentBlock));
            const insertPos = commentStart.translate(1, 0); // After the /* line
            edits.insert(document.uri, insertPos, formula + '\n\n');
        } else if (!func.commentBlock) {
            // If function has no comment block, add a new one with master formula
            const funcStart = document.positionAt(func.start);
            edits.insert(document.uri, funcStart, `/*\n${formula}\n*/\n\n`);
        }
    }

    // Apply all edits
    await vscode.workspace.applyEdit(edits);
    vscode.window.showInformationMessage('Master formula added to all functions and file header');
}

/**
 * Show the current property configuration
 */
async function showPropertyConfig() {
    const config = vscode.workspace.getConfiguration('lukeLinter');
    const customProperties = config.get('customProperties');

    // Create a formatted configuration display
    const configDisplay = {
        "Default Properties": {
            "File Level": linter.propertyConfig.scopes.file.map(tag => ({
                name: tag,
                ...linter.propertyConfig.properties[tag]
            })),
            "Function Level": linter.propertyConfig.scopes.function.map(tag => ({
                name: tag,
                ...linter.propertyConfig.properties[tag]
            }))
        },
        "Custom Properties": customProperties,
        "Settings": {
            "Enabled File Types": config.get('fileTypes'),
            "Ignore Patterns": config.get('ignorePatterns'),
            "Linting Enabled": config.get('enableLinting')
        }
    };

    // Create a temporary file to show the configuration
    const document = await vscode.workspace.openTextDocument({
        content: JSON.stringify(configDisplay, null, 2),
        language: 'json'
    });

    await vscode.window.showTextDocument(document);
}

/**
 * Initialize or update project-specific property configuration
 */
async function initProjectConfig() {
    // Check if we have an active workspace
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Please open a workspace first');
        return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const configPath = vscode.Uri.file(`${workspaceRoot}/.luke-linter.json`);

    try {
        // Try to read existing config
        let existingConfig = {};
        try {
            const existingFile = await vscode.workspace.fs.readFile(configPath);
            existingConfig = JSON.parse(existingFile.toString());
        } catch (error) {
            // File doesn't exist yet, that's fine
        }

        // Create new config by merging existing with defaults
        const newConfig = {
            properties: {
                ...linter.propertyConfig.properties,
                ...(existingConfig.properties || {})
            },
            scopes: {
                ...linter.propertyConfig.scopes,
                ...(existingConfig.scopes || {})
            }
        };

        // Create the configuration file
        const configContent = JSON.stringify(newConfig, null, 2);
        await vscode.workspace.fs.writeFile(
            configPath,
            Buffer.from(configContent, 'utf-8')
        );

        // Open the file in the editor
        const document = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(document);

        vscode.window.showInformationMessage('Project configuration file created/updated');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create/update configuration: ${error.message}`);
    }
}

function activate(context) {
    // Initialize diagnostic collection
    diagnosticCollection = vscode.languages.createDiagnosticCollection('property-linter');
    context.subscriptions.push(diagnosticCollection);

    // Register document change listener
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            analyzeDiagnostics(event.document);
        })
    );

    // Register document open listener
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            analyzeDiagnostics(document);
        })
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('lukeLinter.checkDocument', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                analyzeDiagnostics(editor.document);
                vscode.window.showInformationMessage('Document check complete');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lukeLinter.checkWorkspace', checkWorkspace)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lukeLinter.addFileProperties', () => {
            addFileProperties(vscode.window.activeTextEditor);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lukeLinter.addFunctionProperties', () => {
            addFunctionProperties(vscode.window.activeTextEditor);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lukeLinter.showPropertyConfig', showPropertyConfig)
    );

    // Register the new command
    context.subscriptions.push(
        vscode.commands.registerCommand('lukeLinter.initProjectConfig', initProjectConfig)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lukeLinter.addMasterFormula', () => {
            addMasterFormula(vscode.window.activeTextEditor);
        })
    );

    // Analyze all open documents
    vscode.workspace.textDocuments.forEach(document => {
        analyzeDiagnostics(document);
    });

    // Load saved fold state
    const savedFoldState = context.globalState.get('ffold.foldedTags', []);
    globalFoldState = new Set(savedFoldState);

    // Register the file open handler first
    let openDocumentDisposable = vscode.workspace.onDidOpenTextDocument(async (document) => {
        // Wait a bit for the editor to be ready
        await new Promise(resolve => setTimeout(resolve, 100));

        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === document) {
            // vscode.window.showInformationMessage(`Opening file: ${document.fileName}`);
            await applyFoldState(editor);
        }
    });

    // Add handler for when user changes focus between editors
    let activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor) {
            // vscode.window.showInformationMessage(`Focusing file: ${editor.document.fileName}`);
            await applyFoldState(editor);
        }
    });

    // Apply fold state to currently active editor
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        applyFoldState(activeEditor);
    }

    // Add to subscriptions immediately
    context.subscriptions.push(openDocumentDisposable, activeEditorDisposable);

    // Create a decorator type that we'll use to highlight tagged sections
    testDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 0, 0.3)', // Light yellow background
        borderRadius: '2px'
    });

    // Register the highlight all command
    let highlightDisposable = vscode.commands.registerCommand('ffold.highlightAll', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor!');
            return;
        }

        const text = editor.document.getText();
        const decorations = [];

        // Find all sections between region [[OPEN:tag]] and endregion [[CLOSE:tag]]
        let match;
        while ((match = REGION_PATTERN.FULL.exec(text)) !== null) {
            const startPos = editor.document.positionAt(match.index);
            const endPos = editor.document.positionAt(match.index + match[0].length);
            const decoration = { range: new vscode.Range(startPos, endPos) };
            decorations.push(decoration);
        }

        // Apply the decorations
        editor.setDecorations(testDecorationType, decorations);

        vscode.window.showInformationMessage('All tagged sections highlighted!');
    });

    // Register the highlight specific tag command
    let highlightTagDisposable = vscode.commands.registerCommand('ffold.highlightSpecificTag', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor!');
            return;
        }

        // Find all unique tags in the document
        const text = editor.document.getText();
        const tags = new Set();
        let match;

        while ((match = REGION_PATTERN.START.exec(text)) !== null) {
            tags.add(match[1]);
        }

        if (tags.size === 0) {
            vscode.window.showInformationMessage('No tagged sections found!');
            return;
        }

        // Show quick pick with all available tags
        const selectedTag = await vscode.window.showQuickPick(Array.from(tags), {
            placeHolder: 'Select a tag to highlight'
        });

        if (selectedTag) {
            const decorations = [];
            const tagRegex = new RegExp(`\\/\\/ #region \\[\\[OPEN:${selectedTag}\\]\\][\s\\S]*?\\/\\/ #endregion \\[\\[CLOSE:${selectedTag}\\]\\]`, 'g');

            while ((match = tagRegex.exec(text)) !== null) {
                const startPos = editor.document.positionAt(match.index);
                const endPos = editor.document.positionAt(match.index + match[0].length);
                const decoration = { range: new vscode.Range(startPos, endPos) };
                decorations.push(decoration);
            }

            // Apply the decorations
            editor.setDecorations(testDecorationType, decorations);

            vscode.window.showInformationMessage(`Highlighted sections with tag: ${selectedTag}`);
        }
    });

    // Register the fold command
    let foldDisposable = vscode.commands.registerCommand('ffold.foldAll', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor!');
            return;
        }

        await foldAll(editor);
        vscode.window.showInformationMessage('Tagged sections folded!');
    });

    // Register the fold specific tag command
    let foldTagDisposable = vscode.commands.registerCommand('ffold.foldSpecificTag', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor!');
            return;
        }

        // Find all unique tags in the document
        const text = editor.document.getText();
        const tagRegex = new RegExp(`\\/\\/ #region \\[\\[OPEN:(\\w+)\\]\\]`, 'g');
        const tags = new Set();
        let match;

        while ((match = tagRegex.exec(text)) !== null) {
            tags.add(match[1]);
        }

        if (tags.size === 0) {
            vscode.window.showInformationMessage('No tagged sections found!');
            return;
        }

        // Show input box for tag selection
        const tagInput = await vscode.window.showInputBox({
            placeHolder: 'Enter tags separated by commas (e.g., imports,config,methods)',
            prompt: 'Enter the tags you want to fold',
            value: Array.from(tags).join(',')
        });

        if (tagInput) {
            const selectedTags = tagInput.split(',').map(tag => tag.trim()).filter(tag => tag);
            const regions = [];

            // Find regions for each selected tag
            for (const tag of selectedTags) {
                if (!tags.has(tag)) {
                    vscode.window.showWarningMessage(`Tag "${tag}" not found in document`);
                    continue;
                }

                const tagRegex = new RegExp(`\\/\\/ #region \\[\\[OPEN:${tag}\\]\\]`, 'g');
                let match;

                while ((match = tagRegex.exec(text)) !== null) {
                    const lineNumber = editor.document.positionAt(match.index).line;
                    regions.push(lineNumber);
                }
            }

            if (regions.length > 0) {
                // Fold the regions
                await vscode.commands.executeCommand('editor.fold', {
                    selectionLines: regions
                });
                vscode.window.showInformationMessage(`Folded sections with tags: ${selectedTags.join(', ')}`);
            }
        }
    });

    // Register the unfold command
    let unfoldDisposable = vscode.commands.registerCommand('ffold.unfoldAll', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor!');
            return;
        }

        // Simply unfold all regions
        await vscode.commands.executeCommand('editor.unfoldAll');
        vscode.window.showInformationMessage('Tagged sections unfolded!');
    });

    // Register the unfold specific tag command
    let unfoldTagDisposable = vscode.commands.registerCommand('ffold.unfoldSpecificTag', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor!');
            return;
        }

        // Find all unique tags in the document
        const text = editor.document.getText();
        const tagRegex = new RegExp(`\\/\\/ #region \\[\\[OPEN:(\\w+)\\]\\]`, 'g');
        const tags = new Set();
        let match;

        while ((match = tagRegex.exec(text)) !== null) {
            tags.add(match[1]);
        }

        if (tags.size === 0) {
            vscode.window.showInformationMessage('No tagged sections found!');
            return;
        }

        // Show input box for tag selection
        const tagInput = await vscode.window.showInputBox({
            placeHolder: 'Enter tags separated by commas (e.g., imports,config,methods)',
            prompt: 'Enter the tags you want to unfold',
            value: Array.from(tags).join(',')
        });

        if (tagInput) {
            const selectedTags = tagInput.split(',').map(tag => tag.trim()).filter(tag => tag);

            // Get all folding ranges in the document
            const ranges = Object.assign([], await vscode.commands.executeCommand('vscode.executeFoldingRangeProvider', editor.document.uri) || []);

            // Find the ranges that match our tags
            const tagRanges = ranges.filter(range => {
                const startLine = range.start;
                const lineText = editor.document.lineAt(startLine).text;
                return selectedTags.some(tag => lineText.includes(`${REGION_PATTERN.START.exec(lineText)[1]}`));
            });

            // Unfold each matching range
            for (const range of tagRanges) {
                await vscode.commands.executeCommand('editor.unfold', {
                    levels: 1,
                    selectionLines: [range.start]
                });
            }

            vscode.window.showInformationMessage(`Unfolded sections with tags: ${selectedTags.join(', ')}`);
        }
    });

    // Register the fold all files command
    let foldAllFilesDisposable = vscode.commands.registerCommand('ffold.foldAllFiles', async () => {
        const files = await vscode.workspace.findFiles('**/*.*');
        let foldedCount = 0;

        for (const file of files) {
            try {
                const document = await vscode.workspace.openTextDocument(file);
                await foldAllInFile(document);
                foldedCount++;
            } catch (error) {
                console.error(`Error processing file ${file.fsPath}:`, error);
            }
        }

        vscode.window.showInformationMessage(`Folded regions in ${foldedCount} files`);
    });

    // Register the unfold all files command
    let unfoldAllFilesDisposable = vscode.commands.registerCommand('ffold.unfoldAllFiles', async () => {
        const files = await vscode.workspace.findFiles('**/*.*');
        let unfoldedCount = 0;

        for (const file of files) {
            try {
                const document = await vscode.workspace.openTextDocument(file);
                await unfoldAllInFile(document);
                unfoldedCount++;
            } catch (error) {
                console.error(`Error processing file ${file.fsPath}:`, error);
            }
        }

        vscode.window.showInformationMessage(`Unfolded regions in ${unfoldedCount} files`);
    });

    // Add command to manage fold state
    let setFoldStateDisposable = vscode.commands.registerCommand('ffold.setFoldState', async () => {
        // Find all unique tags in the workspace
        const files = await vscode.workspace.findFiles('**/*.*');
        const tags = new Set();

        for (const file of files) {
            try {
                const document = await vscode.workspace.openTextDocument(file);
                const text = document.getText();
                const tagRegex = new RegExp(`\\/\\/ #region \\[\\[OPEN:(\\w+)\\]\\]`, 'g');
                let match;

                while ((match = tagRegex.exec(text)) !== null) {
                    tags.add(match[1]);
                }
            } catch (error) {
                console.error(`Error processing file ${file.fsPath}:`, error);
            }
        }

        if (tags.size === 0) {
            vscode.window.showInformationMessage('No tagged sections found in workspace!');
            return;
        }

        // Create quickpick items with checkboxes, pre-checked if tag is in globalFoldState
        const quickPickItems = Array.from(tags).map(tag => ({
            label: tag,
            picked: globalFoldState.has(tag)
        }));

        // Show quick pick with checkboxes
        const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select tags to keep folded',
            canPickMany: true
        });

        if (selectedItems) {
            // Update global fold state
            globalFoldState = new Set(selectedItems.map(item => item.label));
            // Save to persistent storage
            await context.globalState.update('ffold.foldedTags', Array.from(globalFoldState));

            // Apply to current file if there is an active editor
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                await applyFoldState(editor);
            }

            vscode.window.showInformationMessage(
                `Fold state updated. Selected tags will be folded in all files.`
            );
        }
    });

    // Add to subscriptions
    context.subscriptions.push(
        highlightDisposable,
        highlightTagDisposable,
        foldDisposable,
        foldTagDisposable,
        unfoldDisposable,
        unfoldTagDisposable,
        foldAllFilesDisposable,
        unfoldAllFilesDisposable,
        setFoldStateDisposable
    );
}

// Add this helper function
async function applyFoldState(editor) {
    if (!editor) return;

    await vscode.commands.executeCommand('editor.unfoldAll');

    if (globalFoldState.size === 0) return;

    const text = editor.document.getText();
    const regions = [];

    for (const tag of globalFoldState) {
        const tagRegex = new RegExp(`\\/\\/ #region \\[\\[OPEN:${tag}\\]\\]`, 'g');
        let match;

        while ((match = tagRegex.exec(text)) !== null) {
            const lineNumber = editor.document.positionAt(match.index).line;
            regions.push(lineNumber);
        }
    }

    if (regions.length > 0) {
        await vscode.commands.executeCommand('editor.fold', {
            selectionLines: regions
        });
    }
}

function deactivate() {
    if (testDecorationType) {
        testDecorationType.dispose();
    }

    if (diagnosticCollection) {
        diagnosticCollection.clear();
        diagnosticCollection.dispose();
    }
}

module.exports = {
    activate,
    deactivate
}; 