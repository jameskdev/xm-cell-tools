export class SubripObj { 
    seq : number; 
    startHr : number; 
    startMin : number; 
    startSec : number; 
    startMs : number; 
    endHr : number;
    endMin : number; 
    endSec : number; 
    endMs : number;
    contents : Array<string>;

    constructor(sq : number, 
    shr : number, 
    smin : number, 
    ssec : number, 
    sms : number, 
    ehr : number, 
    emin : number, 
    esec : number, 
    ems : number, 
    cnt : Array<string>) {
        this.seq = sq,
        this.startHr = shr,
        this.startMin = smin,
        this.startSec = ssec,
        this.startMs = sms,
        this.endHr = ehr,
        this.endMin = emin,
        this.endSec = esec,
        this.endMs = ems;
        this.contents = cnt; 
    }

    getStartTime() : string {
        return ((this.startHr < 10) ? ("0" + this.startHr) : this.startHr) + ":" + 
            ((this.startMin < 10) ? ("0" + this.startMin) : this.startMin) + ":" + 
            ((this.startSec < 10) ? ("0" + this.startSec) : this.startSec) + "," + 
            ((this.startMs < 100) ? (((this.startMs < 10) ? ("00" + this.startMs) : "0" + this.startMs)) : this.startMs);
    }

    getEndTime() : string {
        return ((this.endHr < 10) ? ("0" + this.endHr) : this.endHr) + ":" + 
            ((this.endMin < 10) ? ("0" + this.endMin) : this.endMin) + ":" + 
            ((this.endSec < 10) ? ("0" + this.endSec) : this.endSec) + "," + 
            ((this.endMs < 100) ? (((this.endMs < 10) ? ("00" + this.endMs) : "0" + this.endMs)) : this.endMs);
    }

    getContents() : string {
        let contentsLines = "";
        for (let lineNo = 0; lineNo < this.contents.length; lineNo++) {
            contentsLines = contentsLines + this.contents[lineNo];
            if (lineNo < this.contents.length - 1) {
                contentsLines = contentsLines + "\n";
            }
        }
        return contentsLines;
    }

    getString() : string {
        return this.seq + "\n" + 
            ((this.startHr < 10) ? ("0" + this.startHr) : this.startHr) + ":" + 
            ((this.startMin < 10) ? ("0" + this.startMin) : this.startMin) + ":" + 
            ((this.startSec < 10) ? ("0" + this.startSec) : this.startSec) + "," + 
            ((this.startMs < 100) ? (((this.startMs < 10) ? ("00" + this.startMs) : "0" + this.startMs)) : this.startMs) + " --> " + 
            ((this.endHr < 10) ? ("0" + this.endHr) : this.endHr) + ":" + 
            ((this.endMin < 10) ? ("0" + this.endMin) : this.endMin) + ":" + 
            ((this.endSec < 10) ? ("0" + this.endSec) : this.endSec) + "," + 
            ((this.endMs < 100) ? (((this.endMs < 10) ? ("00" + this.endMs) : "0" + this.endMs)) : this.endMs) + "\n" + this.getContents();
    }
}

export function exportToSrtFile(input : Array<SubripObj>) : string {
    let ret = "";
    for (let cb = 0; cb < input.length; cb++) {
        ret = ret + input[0].getString();
        if (cb < input.length - 1) ret = ret + "\n\n";
    }
    return ret;
}

export function parseFromInputString(input : string) : Array<SubripObj> {
    const blocks = input.replaceAll("\r", "").split("\n\n"); // Double line-breaks separate each block. Also, remove all \r line breaks (in case the file was created in Windows)
    const numOfBlocks = blocks.length;
    const ret = new Array<SubripObj>();
    for (let i = 0; i < numOfBlocks; i++) {
        const currentBlockSeparated = blocks[i].split("\n");
        if (currentBlockSeparated.length < 3) continue;
        
        let sequenceInt : number = Number.parseInt(currentBlockSeparated[0]);
        if (Number.isNaN(sequenceInt)) sequenceInt = i;
        
        const timeSection = currentBlockSeparated[1].trim().replaceAll(" ", "").split("-->");
        const startSection = timeSection[0].split(":");
        const endSection = timeSection[1].split(":");

        const startSecMilliSec = startSection[2].split(",");
        let startHour = Number.parseInt(startSection[0]);
        let startMinute = Number.parseInt(startSection[1]);
        let startSecond = Number.parseInt(startSecMilliSec[0]);
        let startMillisec = Number.parseInt(startSecMilliSec[1]);
        if (Number.isNaN(startHour) || Number.isNaN(startMinute) || Number.isNaN(startSecond) || Number.isNaN(startMillisec)) continue;

        const endSecMilliSec = endSection[2].split(",");
        let endHour = Number.parseInt(endSection[0]);
        let endMinute = Number.parseInt(endSection[1]);
        let endSecond = Number.parseInt(endSecMilliSec[0]);
        let endMillisec = Number.parseInt(endSecMilliSec[1]);
        if (Number.isNaN(endHour) || Number.isNaN(endMinute) || Number.isNaN(endSecond) || Number.isNaN(endMillisec)) continue;

        const contentsLines = currentBlockSeparated.slice(2);

        ret.push(new SubripObj(sequenceInt, startHour, startMinute, startSecond, startMillisec, endHour, endMinute, endSecond, endMillisec, contentsLines));
    }
    return ret;
}