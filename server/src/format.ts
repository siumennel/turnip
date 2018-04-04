import { escapeRegExp } from './util';

interface FormatConf {
    text: string,
    type: string,
    indents?: number
}

interface Block {
    line: number,
    block: number,
    data: string[]
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

/**
 * return the text length by full-width charactor = 2 and half-width charactor = 1 
 * @param str 
 */
function charCount(str: string) {
    let len = 0;
    //escape
    var strE = escape(str);
    for (let i = 0; i < strE.length; i++ , len++) {
        //エスケープされた文字なら
        if (strE.charAt(i) == "%") {
            //全角なら、通常の＋１の他にもう一度足す
            if (strE.charAt(++i) == "u") {
                i += 3;
                len++;
            }
            i++;
        }
    }
    return len;
}


function formatTables(text: any) {
    let blockNum = 0;
    let textArr = text.split(/\r?\n/g);

    //Get blocks with data in cucumber tables
    const blocks: Block[] = textArr
        .reduce((res: any, l: any, i: any, arr: any) => {
            if (~l.search(/^\s*\|/)) {
                res.push({
                    line: i,
                    block: blockNum,
                    data: l.split(/\s*\|\s*/).filter((v: any, i: any, arr: any) => (i > 0) && (i < (arr.length - 1)))
                });
                if (i < arr.length - 1 && !~arr[i + 1].search(/^\s*\|/)) {
                    blockNum++;
                }
            }
            return res;
        }, []);

    //Get max value for each table cell
    const maxes = blocks.reduce((res, b) => {
        const block = b.block;
        if (res[block]) {
            res[block] = res[block].map((v: any, i: any) => Math.max(v, charCount(b.data[i])));
        } else {
            res[block] = b.data.map(v => charCount(v));
        }
        return res;
    }, []);

    //Change all the 'block' lines in our document using correct distance between words
    blocks.forEach(block => {
        let change = block.data
            .map((d, i) => ` ${d}${' '.repeat(maxes[block.block][i] - charCount(d))} `)
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
