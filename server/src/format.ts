import { escapeRegExp } from './util';

interface FormatConf {
    text: string,
    type: string,
    indents?: number
}

const FORMAT_CONF: FormatConf[] = [
    { text: 'Feature:', type: 'num', indents: 0 },
    { text: 'Scenario:', type: 'num', indents: 1 },
    { text: 'Background:', type: 'num', indents: 1 },
    { text: 'Scenario Outline:', type: 'num', indents: 1 },
    { text: 'Examples:', type: 'num', indents: 2 },
    { text: 'Given', type: 'num', indents: 2 },
    { text: 'When', type: 'num', indents: 2 },
    { text: 'Then', type: 'num', indents: 2 },
    { text: 'And', type: 'num', indents: 2 },
    { text: 'But', type: 'num', indents: 2 },
    { text: '\\|', type: 'num', indents: 3 },
    { text: '"""', type: 'num', indents: 3 },
    { text: '#', type: 'relative' },
    { text: '@', type: 'relative' },
];

function findFormat(line: string): FormatConf {
    return FORMAT_CONF.find(conf => line.search(new RegExp(escapeRegExp('^\\s*' + conf.text))) > -1);
}

function correctIndents(text: any, indent: any) {
    let defaultIndent = 0;
    return text
        .split(/\r?\n/g)
        .map((line: any, i: any, textArr: any) => {
            if (~line.search(/^\s*$/)) return '';
            //Remove spaces in the end of string
            line = line.replace(/\s*$/, '');
            let format = findFormat(line);
            let indentCount;
            if (format && format.type === 'num') {
                indentCount = format.indents;
                defaultIndent = indentCount;
            } else if (format && format.type === 'relative') {
                let nextLine = textArr.slice(i + 1).find((l: string) => findFormat(l) && findFormat(l).type === 'num');
                indentCount = nextLine ? findFormat(nextLine).indents : 0;
            } else {
                indentCount = defaultIndent;
            }
            return line.replace(/^\s*/, indent.repeat(indentCount));
        })
        .join('\r\n');
}

function formatTables(text: any) {
    let blocks: {
        line: number,
        block: number,
        data: string[]
    }[];
    let maxes: any;
    //let lines: any;
    let blockNum = 0;
    let textArr = text.split(/\r?\n/g);

    //Get blocks with data in cucumber tables
    blocks = textArr
        .reduce((res: any, l: any, i: any, arr: any) => {
            if (~l.search(/^\s*\|/)) {
                res.push({
                    line: i,
                    block: blockNum,
                    data: l.split(/\s*\|\s*/).filter((i:any, arr:any) => (i > 0) && (i < (arr.length - 1)))
                });
                if (i < arr.length && !~arr[i + 1].search(/^\s*\|/)) {
                    blockNum++;
                }
            }
            return res;
        }, []);

    //Get max value for each table cell
    maxes = blocks.reduce((res, b) => {
        let block = b.block;
        if (res[block]) {
            res[block] = res[block].map((v: any, i: any) => Math.max(v, b.data[i].length));
        } else {
            res[block] = b.data.map(v => v.length);
        }
        return res;
    }, []);

    //Change all the 'block' lines in our document using correct distance between words
    blocks.forEach(block => {
        let change = block.data
            .map((d, i) => ` ${d}${' '.repeat(maxes[block.block][i] - d.length)} `)
            .join('|');
        change = `|${change}|`;
        textArr[block.line] = textArr[block.line].replace(/\|.*/, change);
    });

    return textArr.join('\r\n');
}

export function format(indent: string, text: string): string {

    //Insert correct indents for all the lined differs from string start
    text = correctIndents(text, indent);

    //We should format all the tables present
    text = formatTables(text);

    return text;

}
