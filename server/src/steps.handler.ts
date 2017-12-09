import {
    getOSPath,
    getFileContent,
    clearComments,
    getMD5Id,
    escapeRegExp,
    getTextRange,
    getSortPrefix
} from './util';

import {
    Definition,
    CompletionItem,
    Diagnostic,
    DiagnosticSeverity,
    Position,
    Location,
    Range,
    CompletionItemKind
} from 'vscode-languageserver';

const glob = require('glob');

export type StepSettings = string[];

export type Step = {
    id: string,
    reg: RegExp,
    text: string,
    desc: string,
    def: Definition,
    count: number
};

export type StepsCountHash = {
    [step: string]: number
};

export default class StepsHandler {
    /**
     * all steps
     */
    elements: Step[];
    /**
     * if the step already in elements array, it is true;
     */
    elementsHash: { [step: string]: boolean } = {};
    /**
     * how many times the step has been used by user's auto completion
     */
    elemenstCountHash: StepsCountHash = {};

    constructor(root: string, stepsPathes: StepSettings, sync: boolean | string) {
        this.populate(root, stepsPathes);
        if (sync === true) {
            this.setElementsHash(`${root}/**/*.feature`);
        } else if (typeof sync === 'string') {
            this.setElementsHash(`${root}/${sync}`);
        }
    }

    getElements(): Step[] {
        return this.elements;
    }
    /**
     * count use times for every steps.
     * @param path 
     */
    setElementsHash(path: string): void {
        this.elemenstCountHash = {};
        let files = glob.sync(path, { ignore: '.gitignore' });
        files.forEach((f:any) => {
            let text = getFileContent(f);
            text.split(/\r?\n/g).forEach(line => {
                let match = line.match(this.gherkinRegEx);
                if (match) {
                    let step = this.getStepByText(match[4]);
                    if (step) {
                        this.incrementElementCount(step.id);
                    }
                }
            });
        });
        //update the step's count to the newest used times.
        this.elements.forEach(el => el.count = this.getElementCount(el.id));
    }
    
    /**
     * mark the step been used. when it is been used, plus 1. 
     * @param id
     */
    incrementElementCount(id: string): void {
        if (this.elemenstCountHash[id]) {
            this.elemenstCountHash[id]++;
        } else {
            this.elemenstCountHash[id] = 1;
        }
    }
    
    getElementCount(id: string): number {
        return this.elemenstCountHash[id] || 0;
    }

    /**
     * get step definition regExp 
     */
    getStepRegExp(): RegExp {
        //  step ":user で伝言を開く" do |user|
        let r = new RegExp('^(\\s*?)step(\\s+)"([^"]+?)"(\\s+)do([\\s\\S]*)$');
        //group[3]= :user で伝言を開く
        return r;
    }
    
    /**
     * if line is a step sentence return its regExp match result.
     * @param line
     */
    getMatch(line: string): RegExpMatchArray {
        return line.match(this.getStepRegExp());
    }
    /**
     * translate turnip step format to regexp format.
     * it is used to go to definition.
     */
    getRegTextForStep(step: string): string {

        //Ruby interpolation (like `#{Something}` ) should be replaced with `.*`
        //https://github.com/alexkrechik/VSCucumberAutoComplete/issues/65
        //step = step.replace(/#{(.*?)}/g, '.*');
        step = step.replace(/(:\w+)/g, '.*');
        step = step.replace('(', '\\(');
        step = step.replace(')', '\\)');

        //Built in transforms
        //https://github.com/alexkrechik/VSCucumberAutoComplete/issues/66
        //step = step.replace(/{float}/g, '-?\\d*\\.?\\d+');
        //step = step.replace(/{int}/g, '-?\\d+');
        //step = step.replace(/{stringInDoubleQuotes}/g, '"[^"]+"');

        //Handle Cucumber Expressions (like `{Something}`) should be replaced with `.*`
        //https://github.com/alexkrechik/VSCucumberAutoComplete/issues/99
        //Cucumber Expressions Custom Parameter Type Documentation
        //https://docs.cucumber.io/cucumber-expressions/#custom-parameters
        step = step.replace(/([^\\]){(?![\d,])(.*?)}/g, '$1.*');

        //Escape all the regex symbols to avoid errors
        step = escapeRegExp(step);

        return step;
    }

    /**
     * get Text For Step
     * @param step
     */
    getTextForStep(step: string): string {

        //Remove all the backslashes
        step = step.replace(/\\/g, '');

        //Remove "string start" and "string end" RegEx symbols
        step = step.replace(/^\^|\$$/g, '');

        //All the "match" parts from double quotes should be removed
        //ex. `"(.*)"` should be changed by ""
        step = step.replace(/"\([^\)]*\)"/g, '""');

        return step;
    }

    /**
     * get Desc string for the step
     */
    getDescForStep(step: string): string {

        //Remove 'Function body' part
        step = step.replace(/\{.*/, '');

        //Remove spaces in the beginning end in the end of string
        step = step.replace(/^\s*/, '').replace(/\s*$/, '');

        return step;
    }

    /**
     * Handle regexp's like 'I do (one|to|three)'
     */
    getStepTextInvariants(step: string): string[] {
        //Handle regexp's like 'I do (one|to|three)'
        if (~step.search(/(\([^\)^\()]+\|[^\(^\)]+\))/)) {
            const match = step.match(/(\([^\)]+\|[^\)]+\))/);
            const matchRes = match[1];
            const variants = matchRes.replace(/^\(|\)$/g, '').split('|');
            return variants.reduce((varRes, variant) => {
                return varRes.concat(this.getStepTextInvariants(step.replace(matchRes, variant)));
            }, []);
        } else {
            return [step];
        }
    }
/**
 * create a step object from step line
 * @param fullStepLine 
 * @param stepPart 
 * @param def 
 */
    getSteps(fullStepLine: string, stepPart: string, def: Location): Step[] {
        const stepsVariants = this.getStepTextInvariants(stepPart);
        const desc = this.getDescForStep(fullStepLine);
        return stepsVariants.map((step) => {
            const reg = new RegExp(this.getRegTextForStep(step));
            const text = this.getTextForStep(step);
            const id = 'step' + getMD5Id(text);
            const count = this.getElementCount(id);
            return { id, reg, text, desc, def, count };
        });
    }

    /**
     * get all steps from the ruby file
     * @param filePath 
     */
    getFileSteps(filePath: string): Step[] {
        let definitionFile = getFileContent(filePath);
        definitionFile = clearComments(definitionFile);
        return definitionFile.split(/\r?\n/g).reduce((steps, line, lineIndex) => {
            let match = this.getMatch(line);
            if (match) {
                //let [, beforeGherkin, , , stepPart] = match;
                let [, beforeGherkin, ,stepPart] = match;
                let pos = Position.create(lineIndex, beforeGherkin.length);
                let def = Location.create(getOSPath(filePath), Range.create(pos, pos));
                steps = steps.concat(this.getSteps(line, stepPart, def));
            }
            return steps;
        }, []);
    }

    validateConfiguration(settingsFile: string, stepsPathes: StepSettings, workSpaceRoot: string): Diagnostic[] {
        return stepsPathes.reduce((res, path) => {
            let files = glob.sync(path, { ignore: '.gitignore' });
            if (!files.length) {
                let searchTerm = path.replace(workSpaceRoot + '/', '');
                let range = getTextRange(workSpaceRoot + '/' + settingsFile, `"${searchTerm}"`);
                res.push({
                    severity: DiagnosticSeverity.Warning,
                    range: range,
                    message: `No steps files found`,
                    source: 'turnip'
                });
            }
            return res;
        }, []);
    }
    /**
     * restore all steps from ruby files to elementsHash and elements
     * @param root  
     * @param stepsPathes 
     */
    populate(root: string, stepsPathes: StepSettings): void {
        this.elementsHash = {};
        this.elements = stepsPathes
            .reduce((files, path) => files.concat(glob.sync(root + '/' + path, { ignore: '.gitignore' })), [])
            .reduce((elements, f) => elements.concat(
                this.getFileSteps(f).reduce((steps, step) => {
                    if (!this.elementsHash[step.id]) {
                        steps.push(step);
                        this.elementsHash[step.id] = true;
                    }
                    return steps;
                }, [])
            ), []);
    }

    gherkinWords = 'Given|When|Then|And|But';
    gherkinRegEx = new RegExp('^(\\s*)(' + this.gherkinWords + ')(\\s+)(.*)');
    
    /**
     * see if the given sentence has a defined step in ruby file.
     * for example:
     * Given I have a dream
     * step in ruby is: I have :something
     * so step's regexp is: I have .*
     * so it does matched and we return the step in the elements array.
     * @param text
     */
    getStepByText(text: string): Step {
        return this.elements.find(s => s.reg.test(text));
    }
    /**
     * see if the gerkin sentence has a defined step in ruby file.
     * if not, give user a hint message.
     * @param line
     * @param lineNum 
     */
    validate(line: string, lineNum: number): Diagnostic | null {
        line = line.replace(/\s*$/, '');
        let lineForError = line.replace(/^\s*/, '');
        let match = line.match(this.gherkinRegEx);
        if (!match) {
            return null;
        }
        let beforeGherkin = match[1];
        let step = this.getStepByText(match[4]);
        if (step) {
            return null;
        } else {
            return {
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: lineNum, character: beforeGherkin.length },
                    end: { line: lineNum, character: line.length }
                },
                message: `Was unable to find step for "${lineForError}"`,
                source: 'turnip'
            };
        }
    }
    
    /**
     * find the matched step in ruby file.
     * @param line 
     * @param char 
     */
    getDefinition(line: string, char: number): Definition | null {
        let match = line.match(this.gherkinRegEx);
        
        if(char ){
        }

        if (!match) {
            return null;
        }
        let step = this.getStepByText(match[4]);
        return step ? step.def : null;
    }
    
    /**
     * list all steps that helps user to complete the sentence.
     * @param line 
     * @param position 
     */
    getCompletion(line: string, position: Position): CompletionItem[] | null {
        //Get line part without gherkin part
        let match = line.match(this.gherkinRegEx);
        if (!match) {
            return null;
        }

        if(position){
        }

        let stepPart = match[4];
        let gerkinWord = match[2];
        let insertPositionIdx = line.indexOf(gerkinWord) + gerkinWord.length+1;

        //for japanese user, they always type fullwidth space rather than halfwidth space.
        //so let us change fullwidth space to halfwidth space.
        stepPart = stepPart.replace(/　/g, ' ');
        
        //first of all, let's see how many words have been typed by user.
        let searchWords = stepPart.split(' ');
        //remove space from array.
        searchWords = searchWords.filter(word => word !== "");
　　　　　
        let filterText = "";
　　　　　if(searchWords && searchWords.length > 0){
          filterText =　searchWords[searchWords.length - 1];
        }

        let res = this.elements
            .filter(el => {
                //all the key words should be searched.
                if (!searchWords || searchWords.length == 0 ){
                   return false;
                }

                if (searchWords.length == 1 && searchWords[0] == "" ){
                    return false;
                }

                let cnt = 0;
                for (let index = 0; index < searchWords.length; index++) {
                    const keyword = searchWords[index].trim();
                    if (el.text.search(keyword) !== -1){
                        cnt++;
                    }
                }

                if (cnt == searchWords.length ){
                  return true;
                }

                return false;
                 
                })
            .map(step => {
                let label = step.text;

                for (let index = 0; index < searchWords.length; index++) {
                    if (filterText != "") {
                        label = label.replace(searchWords[index], " " + searchWords[index]);
                    }
                }
                
                let theData =　{
                　  line: position.line,
                    start: insertPositionIdx,
                    character: position.character
                };

                return {
                    label: label,
                    kind: CompletionItemKind.Method,
                    //data: step.id,
                    data: theData,
                    sortText: getSortPrefix(step.count, 5) + '_' + label,
                    filterText: label,
                    insertText: step.text,
                    //detail: step.text,
                    documentation: step.text
                };
            });

        return res.length ? res : null;
    }

    getCompletionResolve(item: CompletionItem): CompletionItem {
        //this.incrementElementCount(item.data);

           　  //line: position.line,
                    //start: insertPositionIdx,
                    //character: position.character
        item.textEdit = {
            range: {
                start: {
                    line: item.data.line,
                    character: item.data.start
                },
                end: {
                    line: item.data.line,
                    character: item.data.character
                }
            },
            newText: item.documentation
        };

        return item;
    };

}
