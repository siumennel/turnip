import {
    getOSPath,
    getFileContent,
    clearComments,
    getMD5Id
} from './util';

import {
    Definition,
    CompletionItem,
    Position,
    Location,
    Range,
    Diagnostic,
    DiagnosticSeverity,
    CompletionItemKind
    //TextEdit
} from 'vscode-languageserver';

//import * as glob from 'glob';
const glob = require("glob");

export type PagesSettings = {
    [page: string]: string
};

export type Page = {
    id: string,
    text: string,
    desc: string,
    def: Definition,
    objects: PageObject[],
    [key:string]:any
};

export type PageObject = {
    id: string,
    text: string,
    desc: string,
    def: Definition,
    [key: string]: any
};

type FeaturePosition = { page: string, object: string, [key: string]: any } | { page: string, [key: string]: any } | null;

export default class PagesHandler {

    elements: Page[];

    getElements(page?: string, pageObject?: string): Page[] | Page | PageObject | null|any {
        if (page !== undefined) {
            let pageElement = this.elements.find(e => e.text === page);
            if (!pageElement) {
                return null;
            }
            if (pageObject !== undefined) {
                let pageObjectElement = pageElement.objects.find(e => e.text === pageObject);
                return pageObjectElement || null;
            } else {
                return pageElement;
            }
        } else {
            return this.elements;
        }
    }

    constructor(root: string, settings: PagesSettings) {
        this.populate(root, settings);
    }

    getPoMatch(line: string): RegExpMatchArray {
        return line.match(/^(?:(?:.*?[\s\.])|.{0})([a-zA-z][^\s\.]*)\s*[:=\(]/);
    }

    getPageObjects(text: string, path: string): PageObject[] {
        let textArr = text.split(/\r?\n/g);
        return textArr.reduce((res, line, i) => {
            let poMatch = this.getPoMatch(line);
            if (poMatch) {
                let pos = Position.create(i, 0);
                let text = poMatch[1];
                if (!res.find(v => v.text === text)) {
                    res.push({
                        id: 'pageObject' + getMD5Id(text),
                        text: text,
                        desc: line,
                        def: Location.create(getOSPath(path), Range.create(pos, pos))
                    });
                }
            }
            return res;
        }, []);
    }

    getPage(name: string, path: string): Page {
        let files = glob.sync(path);
        if (files.length) {
            let file = files[0];
            let text = getFileContent(files[0]);
            text = clearComments(text);
            let zeroPos = Position.create(0, 0);
            return {
                id: 'page' + getMD5Id(name),
                text: name,
                desc: text.split(/\r?\n/g).slice(0, 10).join('\r\n'),
                def: Location.create(getOSPath(file), Range.create(zeroPos, zeroPos)),
                objects: this.getPageObjects(text, file)
            };
        }

        return null;
    }

    populate(root: string, settings: PagesSettings): void {
        this.elements = Object.keys(settings).map(p => this.getPage(p, root + '/' + settings[p]));
    }

    validate(line: string, lineNum: number): Diagnostic[] {
        if (~line.search(/"[^"]*"."[^"]*"/)) {
            return line.split('"').reduce((res, l, i, lineArr) => {
                if (l === '.') {
                    let curr = lineArr.slice(0, i).reduce((a, b) => a + b.length + 1, 0);
                    let page = lineArr[i - 1];
                    let pageObject = lineArr[i + 1];
                    if (!this.getElements(page)) {
                        res.push({
                            severity: DiagnosticSeverity.Warning,
                            range: {
                                start: { line: lineNum, character: curr - page.length - 1 },
                                end: { line: lineNum, character: curr - 1 }
                            },
                            message: `Was unable to find page "${page}"`,
                            source: 'cucumberautocomplete'
                        });
                    } else if (!this.getElements(page, pageObject)) {
                        res.push({
                            severity: DiagnosticSeverity.Warning,
                            range: {
                                start: { line: lineNum, character: curr + 2 },
                                end: { line: lineNum, character: curr + 3 + pageObject.length - 1 }
                            },
                            message: `Was unable to find page object "${pageObject}" for page "${page}"`,
                            source: 'cucumberautocomplete'
                        });
                    }
                }
                return res;
            }, []);
        } else {
            return [];
        }
    }

    getFeaturePosition(line: string, char: number): FeaturePosition {
        let startLine = line.slice(0, char);
        let endLine = line.slice(char).replace(/".*/, '');
        let match = startLine.match(/"/g);
        if (match && match.length % 2) {
            let [, page, object] = startLine.match(/"(?:([^"]*)"\.")?([^"]*)$/);
            if (page) {
                return {
                    page: page,
                    object: object + endLine
                };
            } else {
                return {
                    page: object + endLine
                };
            }
        } else {
            return null;
        }
    }

    getDefinition(line: string, char: number): Definition | null {
        let position = this.getFeaturePosition(line, char);
        if (position) {
            if (position['object']) {
                let el = this.getElements(position['page'], position['object']);
                el =  <Page | PageObject>el;
                return el ? el['def'] : null;
            } else {
                let el = this.getElements(position['page']);
                el = <Page | PageObject>el;
                return el ? el['def'] : null;
            }
        } else {
            return null;
        }
    };

    getPageCompletion(line: string, position: Position, page: Page): CompletionItem {
        let search = line.search(/"([^"]*)"$/);
        if (search > 0 && position.character === (line.length - 1)) {
            //let start = Position.create(position.line, search);
            //let end = Position.create(position.line, line.length);
            //let range = Range.create(start, end);
            return {
                label: page.text,
                kind: CompletionItemKind.Function,
                data: page.id,
                command: { title: 'cursorMove', command: 'cursorMove', arguments: [{ to: 'right', by: 'wrappedLine', select: false, value: 1 }] },
                insertText: page.text + '".'
            };
        } else {
            return {
                label: page.text,
                kind: CompletionItemKind.Function,
                data: page.id
            };
        }
    }

    getPageObjectCompletion(line: string, position: Position, pageObject: PageObject): CompletionItem {
        let insertText = '';
        if (line.length === position.character) {
            insertText = '" ';
        }
        return {
            label: pageObject.text,
            kind: CompletionItemKind.Function,
            data: pageObject.id,
            insertText: pageObject.text + insertText,
            documentation: pageObject.desc,
            detail: pageObject.desc
        };
    }

    getCompletion(line: string, position: Position): CompletionItem[] | null {
        let fPosition = this.getFeaturePosition(line, position.character);
        let page = fPosition['page'];
        let object = fPosition['object'];
        if (object !== undefined && page !== undefined) {
            let pageElement = this.getElements(page);
            if (pageElement) {
                //pageElement = <Page | PageObject>pageElement;
                return pageElement['objects'].map(this.getPageObjectCompletion.bind(null, line, position));
            } else {
                return null;
            }
        } else if (page !== undefined) {
            return this.getElements()['map'](this.getPageCompletion.bind(null, line, position));
        } else {
            return null;
        }
    };

    getCompletionResolve(item: CompletionItem): CompletionItem {
        return item;
    };

}