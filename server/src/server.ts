/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
	IPCMessageReader, IPCMessageWriter, createConnection, IConnection, TextDocuments,
	Diagnostic, InitializeResult, TextDocumentPositionParams, CompletionItem, Definition,
	FormattingOptions, DocumentFormattingParams, TextEdit, Range, Position, DocumentRangeFormattingParams
} from 'vscode-languageserver';

//import { format } from './format';
import StepsHandler, { StepSettings } from './steps.handler';
import PagesHandler, { PagesSettings } from './pages.handler';
import { getOSPath } from './util';
const glob = require('glob');
import * as fs from 'fs';
import { format } from './format';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Object, which contains current configuration
let settings: Settings;
// Elements handlers
let stepsHandler: StepsHandler;
let pagesHandler: PagesHandler;

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites. 
let workspaceRoot: string;
connection.onInitialize((params): InitializeResult => {
	workspaceRoot = params.rootPath;
	console.log("workspaceRoot:"+workspaceRoot);
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			// Tell the client that the server support code complete
			completionProvider: {
				resolveProvider: true
			},
			definitionProvider: true,
			documentFormattingProvider: true,
			documentRangeFormattingProvider: true
		}
	}
});

function handleSteps(): boolean {
	//let s = settings.cucumberautocomplete.steps;
	//return s && s.length ? true : false;
  return true;
}

function handlePages(): boolean {
	//let p = settings.cucumberautocomplete.pages;
	//return p && Object.keys(p).length ? true : false;
	return false;
}

/* function pagesPosition(line: string, char: number): boolean {
	if (handlePages() && pagesHandler.getFeaturePosition(line, char)) {
		return true;
	} else {
		return false;
	}
} */

function populateHandlers() {
	handleSteps() && stepsHandler.populate(workspaceRoot, settings.turnip.steps);
	handlePages() && pagesHandler.populate(workspaceRoot, settings.turnip.pages);
}

function validate(text: string): Diagnostic[] {
	return text.split(/\r?\n/g).reduce((res, line, i) => {
		let diagnostic;
		if (handleSteps() && (diagnostic = stepsHandler.validate(line, i))) {
			res.push(diagnostic);
		} else if (handlePages()) {
			let pagesDiagnosticArr = pagesHandler.validate(line, i);
			res = res.concat(pagesDiagnosticArr);
		}
		return res;
	}, []);
}

function watchFiles(stepsPathes: string[]): void {
	stepsPathes.forEach(path => {
		glob.sync(workspaceRoot + '/' + path, { ignore: '.gitignore' })
			.forEach((f:any) => {
				fs.watchFile(f, () => {
					populateHandlers();
					documents.all().forEach((document) => {
						const text = document.getText();
						const diagnostics = validate(text);
						connection.sendDiagnostics({ uri: document.uri, diagnostics });
					});
				});
			});
	});
}

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
//documents.onDidChangeContent((change) => {
//	validateTextDocument(change.document);
//});

// The settings interface describe the server relevant settings part
interface Settings {
	turnip: TurnipSettings
}

interface TurnipSettings {
	steps: StepSettings;
	pages: PagesSettings;
	syncfeatures: boolean | string
}

// hold the maxNumberOfProblems setting
//let maxNumberOfProblems: number;
// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
	//let settings = <Settings>change.settings;
	//maxNumberOfProblems = settings.lspSample.maxNumberOfProblems || 100;
	// Revalidate any open text documents
	//documents.all().forEach(validateTextDocument);
	
	settings = <Settings>change.settings;
	//We should get array from step string if provided
	settings.turnip.steps = Array.isArray(settings.turnip.steps)
		? settings.turnip.steps : [settings.turnip.steps];
	if (handleSteps()) {
		watchFiles(settings.turnip.steps);
		stepsHandler = new StepsHandler(workspaceRoot, settings.turnip.steps, settings.turnip.syncfeatures);
		let sFile = '.vscode/settings.json';
		let diagnostics = stepsHandler.validateConfiguration(sFile, settings.turnip.steps, workspaceRoot);
		connection.sendDiagnostics({ uri: getOSPath(workspaceRoot + '/' + sFile), diagnostics });
	}
	if (handlePages()) {
		const { pages } = settings.turnip;
		watchFiles(Object.keys(pages).map((key) => pages[key]));
		pagesHandler = new PagesHandler(workspaceRoot, settings.turnip.pages);
	}
});

/* function validateTextDocument(textDocument: TextDocument): void {
	let diagnostics: Diagnostic[] = [];
	let lines = textDocument.getText().split(/\r?\n/g);
	let problems = 0;
	for (var i = 0; i < lines.length && problems < maxNumberOfProblems; i++) {
		let line = lines[i];
		let index = line.indexOf('typescript');
		if (index >= 0) {
			problems++;
			diagnostics.push({
				severity: DiagnosticSeverity.Warning,
				range: {
					start: { line: i, character: index },
					end: { line: i, character: index + 10 }
				},
				message: `${line.substr(index, 10)} should be spelled TypeScript`,
				source: 'ex'
			});
		}
	}
	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
} */

connection.onDidChangeWatchedFiles((_change) => {
	// Monitored files have change in VSCode
	connection.console.log('We recevied an file change event');
});

function pagesPosition(line: string, char: number): boolean {
	if (handlePages() && pagesHandler.getFeaturePosition(line, char)) {
		return true;
	} else {
		return false;
	}
}

documents.onDidOpen(() => {
	populateHandlers();
});

// This handler provides the initial list of the completion items.
connection.onCompletion((position: TextDocumentPositionParams): CompletionItem[] => {
	// The pass parameter contains the position of the text document in 
	// which code complete got requested. For the example we ignore this
	// info and always provide the same completion items.
	/* return [
		{
			label: 'TypeScript',
			kind: CompletionItemKind.Text,
			data: 1
		},
		{
			label: 'JavaScript',
			kind: CompletionItemKind.Text,
			data: 2
		}
	] */
	let text = documents.get(position.textDocument.uri).getText().split(/\r?\n/g);
	let line = text[position.position.line];
	let char = position.position.character;
	if (pagesPosition(line, char)) {
		return pagesHandler.getCompletion(line, position.position);
	}
	if (handleSteps()) {
		return stepsHandler.getCompletion(line, position.position);
	}

	return null;

});

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
/* 	if (item.data === 1) {
		item.detail = 'TypeScript details',
			item.documentation = 'TypeScript documentation'
	} else if (item.data === 2) {
		item.detail = 'JavaScript details',
			item.documentation = 'JavaScript documentation'
	}
	return item; */

	if (~item.data.indexOf('step')) {
		return stepsHandler.getCompletionResolve(item);
	}
	if (~item.data.indexOf('page')) {
		return pagesHandler.getCompletionResolve(item);
	}
	return item;

});

documents.onDidChangeContent((change): void => {
	let changeText = change.document.getText();
	//Validate document
	let diagnostics = validate(changeText);
	connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

connection.onDefinition((position: TextDocumentPositionParams): Definition => {
	let text = documents.get(position.textDocument.uri).getText().split(/\r?\n/g);
	let line = text[position.position.line];
	let char = position.position.character;
	if (pagesPosition(line, char)) {
		return pagesHandler.getDefinition(line, char);
	}
	if (handleSteps) {
		return stepsHandler.getDefinition(line, char);
	}

	return null;
});

/*
connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

function getIndent(options: FormattingOptions): string {
	let { insertSpaces, tabSize } = options;
	return insertSpaces ? ' '.repeat(tabSize) : '\t';
}

connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
	let text = documents.get(params.textDocument.uri).getText();
	let textArr = text.split(/\r?\n/g);
	let indent = getIndent(params.options);
	let range = Range.create(Position.create(0, 0), Position.create(textArr.length - 1, textArr[textArr.length - 1].length));
	return [TextEdit.replace(range, format(indent, text))];
});

connection.onDocumentRangeFormatting((params: DocumentRangeFormattingParams): TextEdit[] => {
	let text = documents.get(params.textDocument.uri).getText();
	let textArr = text.split(/\r?\n/g);
	let range = params.range;
	let indent = getIndent(params.options);
	range = Range.create(Position.create(range.start.line, 0), Position.create(range.end.line, textArr[range.end.line].length));
	text = textArr.splice(range.start.line, range.end.line - range.start.line + 1).join('\r\n');
	return [TextEdit.replace(range, format(indent, text))];
});

// Listen on the connection
connection.listen();
