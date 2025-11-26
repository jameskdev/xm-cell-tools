import {  useRef, useState } from 'react';
import { read, utils, writeFile } from "xlsx";
import styles from "./TableLoader.module.css"
import CellItem, { type CellData } from './CellItem';

export default function TableLoader() {
  const workbook = useRef<Map<string, Map<string, CellData>>>(new Map());
  const [newSheetName, _setNewSheetName] = useState<string>("");
  const [currentSheet, _updateCurrentSheet] = useState<Map<string, CellData> | undefined>();
  const [sheetList, _updateSheetList] = useState<string[]>([]);
  const [currentSheetName, _setCurrentSheetName] = useState<string>("");
  const [topOffset, _setTopOffset] = useState(0);
  const [leftOffset, _setLeftOffset] = useState(0);
  const [maxRows, _setMaxRows] = useState(25);
  const [maxColumns, _setMaxColumns] = useState(25);

  function addNewSheet(sheetName: string) {
    workbook.current.set(sheetName, new Map());
    console.log("Current sheet length is: " + sheetList.length);
    _updateSheetList([...sheetList, sheetName]);
  }

  function removeSheet(sheetName: string) {
    const sheetIndex = sheetList.indexOf(sheetName);
    if (sheetIndex > -1) {
      setCurrentSheet("");
      workbook.current.delete(sheetName);
      const newList = sheetList.filter((x) => { return x != sheetName; });
      console.log(newList);
      _updateSheetList(newList);
    }
  }

  function clearCurrentWorksheet() {
    const newSheet = workbook.current.get(currentSheetName);
    if (newSheet != undefined) {
      newSheet.clear();
      _updateCurrentSheet(new Map(newSheet));
    }
  }

  function setCurrentSheet(sheetName: string) {
    if (sheetName.length == 0) {
      _updateCurrentSheet(undefined);
      _setCurrentSheetName("");
      return;
    }
    const newSheet = workbook.current.get(sheetName);
    if (newSheet != undefined) {
      _updateCurrentSheet(new Map(newSheet));
      _setCurrentSheetName(sheetName);
    }
  }

  function addOrModifyCurrentSheetCell(cellId: string, cell: CellData) {
    const workbookSheet = workbook.current.get(currentSheetName);
    if (workbookSheet != undefined) {
      workbookSheet.set(cellId, cell);
      _updateCurrentSheet(new Map(workbookSheet));
    }
  }

  function pasteToTable(text: string, rowOffset: number = 0, colOffset: number = 0) {
    const workbookSheet = workbook.current.get(currentSheetName);
    if (workbookSheet != undefined && text != null && text != undefined && text.trim() != "") {
      const rows = text.split(/\r?\n/);
      let rn = 0;
      for (let r of rows) {
        let cn = 0;
        const cells = r.split('\t');
        for (let c of cells) {
          const newItem = { row: rn + rowOffset, column: cn + colOffset, value: c };
          if (workbookSheet != undefined) {
            workbookSheet.set(newItem.row + "_" + newItem.column, newItem);
          }
          cn++;
        }
        rn++;
      }
      _updateCurrentSheet(new Map(workbookSheet));
    }
  }

  function fileLoad(loadedFile : File) {
    loadedFile.arrayBuffer().then((res) => { 
      const wb = read(res);
      wb.SheetNames.forEach((sn) => {
        addNewSheet(sn);
        const sheetToAppendTo = workbook.current.get(sn);
        const sheetContents = utils.sheet_to_json<string[]>(wb.Sheets[sn], {header: 1});
        sheetContents.forEach((sheetRow, rowNum) => { 
          sheetRow.forEach((cellContent, colNum) => { sheetToAppendTo?.set(rowNum + "_" + colNum, { row : rowNum, column : colNum, value : cellContent }); });
         })
      })
    });
  }

  function exportCurrentWorkbook() {
    if (workbook.current.size == 0) {
      window.alert("Current workspace is empty, so there is nothing to save!");
      return;
    }
    const wb = utils.book_new();
    const retVal = new Map<string, string[][]>();
    let maxColumns = 0;
    for (const mv of workbook.current) { // iterate over worksheets
      const rowArray = new Array<string[]>();
      for (const vk of mv[1]) { // iterate over each cells
        const vkCell = vk[1];
        while (rowArray.length <= vkCell.row) {
          rowArray.push(new Array<string>());
        }
        const rowData = rowArray[vkCell.row];
        if (maxColumns < vkCell.column) maxColumns = vkCell.column;
        while (rowData.length <= maxColumns) {
          rowData.push("");
        }
        rowData[vkCell.column] = vkCell.value;
      }
      retVal.set(mv[0], rowArray);
    }
    retVal.forEach((v, k) => {
      utils.book_append_sheet(wb, utils.aoa_to_sheet(v), k);
    });
    writeFile(wb, "새로운 워크시트.xlsx");
  }

  function handleClear(): void {
    clearCurrentWorksheet();
  }

  function adjustDisplaySize(clientHeight : number, scrollTop : number, 
      scrollHeight : number, clientWidth : number, 
      scrollLeft : number, scrollWidth : number) {
    if (clientHeight + scrollTop >= scrollHeight) { 
      _setMaxRows(maxRows + 50);
      //_setTopOffset(topOffset + 50);
    } else if (scrollTop == 0) {
      _setMaxRows(Math.max(25));
      //_setTopOffset(Math.max(topOffset - 50, 0));
    }
    if (clientWidth + scrollLeft >= scrollWidth) { 
      _setMaxColumns(maxColumns + 50);
      //_setLeftOffset(leftOffset + 50);
    } else if (scrollLeft == 0) {
      _setMaxColumns(25);
      //_setLeftOffset(Math.max(leftOffset - 50, 0));
    }
  }

  return (
    <div>
      <div className={styles.buttonContainer}>
        <label htmlFor="fileSelector">
          <h4>파일 선택</h4>
        </label>
        <input id="fileSelector" type="file" style={{ display: "none" }} onChange={(ev) => { ev.target.files != null ? fileLoad(ev.target.files[0]) : window.alert("The selected file is null"); }}></input>
        <button type="button" onClick={handleClear}>지우기</button>
        <button type="button" onClick={() => { exportCurrentWorkbook() }}>저장</button>
      </div>
      <div className={styles.buttonContainer}>
        <select name="sheetName" className={styles.sheetSelector} value={currentSheetName} onChange={(ev) => { setCurrentSheet(ev.target.value); }}>
          <option value="" >시트를 선택해 주세요</option>
          {sheetList.map(x => (<option value={x} >{x}</option>))}
        </select>
        <button type="button" className={styles.statHandlerButton} onClick={() => { removeSheet(currentSheetName); }}>시트 삭제</button>
      </div>
      <div className={styles.buttonContainer}>
        <input type="text" className={styles.addSheetTextbox} onChange={(x) => { _setNewSheetName(x.target.value); }} value={newSheetName}></input>
        <button type="button" className={styles.statHandlerButton} onClick={() => { addNewSheet(newSheetName); }}>시트 추가</button>
      </div>
      <div className={styles.tableContainer} onScroll={(ev) => 
          { const currTarget = ev.currentTarget; 
            adjustDisplaySize(currTarget.clientHeight, currTarget.scrollTop, currTarget.scrollHeight, currTarget.clientWidth, currTarget.scrollLeft, currTarget.scrollWidth) }}>
        <table>
          <tbody>
            {currentSheet != undefined ? Array.from({ length: (maxRows - topOffset) }, (_, ri) => (
              <tr key={"ROW_" + (ri + topOffset)}>
                {Array.from({ length: maxColumns - leftOffset }, (_2, ci) => (
                  <CellItem key={(ri + topOffset) + "_" + (ci + leftOffset)} cellValue={currentSheet.get((ri + topOffset) + "_" + (ci + leftOffset))?.value ?? ""} onValueChange={(nv) => { addOrModifyCurrentSheetCell((ri + topOffset) + "_" + (ci + leftOffset), { row: ri + topOffset, column: ci + leftOffset, value: nv }); }} onPaste={(pv) => { pasteToTable(pv, ri, ci); }}></CellItem>
                ))}
              </tr>
            )) : (<tr><td>시트를 새로 추가해 주세요!</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}