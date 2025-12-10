self.onmessage = (e) => {
    let count = 0;
    if (e.data == null || e.data == undefined || !Array.isArray(e.data)) {
        postMessage({ type : -1, resultWorkbook : null, changeCount : 0, message : "Data parameter is null or undefined!" });
        return;
    }
    const workbook = e.data[0];
    const compareSheetName = e.data[1];
    const findColumn = e.data[2];
    const replaceColumn = e.data[3];
    const changeOnPartialMatch = e.data[4];
    if (workbook.constructor.name != "Map") {
        postMessage({ type : -1, resultWorkbook : null, changeCount : 0, message : "Provided workbook object is not a map!" });
        return;
    }
    const refSheet = workbook.get(compareSheetName);
    Array.from(refSheet.values()).filter((x) => { return x.column == findColumn; }).forEach((refValue) => {
      workbook.forEach((v, k) => {
        if (k != compareSheetName) {
          v.forEach((compareCell) => {
            if (changeOnPartialMatch === true) {
              const refString = refValue.value;
              while (compareCell.value.indexOf(refString) > -1) {
                const newValue = refSheet.get(refValue.row + "_" + replaceColumn);
                compareCell.value = compareCell.value.replace(refString, newValue.value);
                count++;
              }
            } else {
              if (compareCell.value == refValue.value) {
                const newValue = refSheet.get(refValue.row + "_" + replaceColumn);
                if (newValue != null && newValue != undefined && newValue != "") {
                  compareCell.value = newValue.value;
                  count++;
                }
              }
            }
          })
        }
      })
    })
    postMessage({ type : 1, resultWorkbook : workbook, changeCount : count, message : "Changes applied!" });
}