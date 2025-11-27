import { useRef, useState } from 'react';
import { read, utils, writeFile } from "xlsx";
import styles from "./TableLoader.module.css"
import CellItem, { type CellData } from './CellItem';
import Worker from './FindAndApplyWorker.js?worker'

export default function TableLoader() {
  const workbook = useRef<Map<string, Map<string, CellData>>>(new Map());
  const [newSheetName, _setNewSheetName] = useState<string>("");
  const [currentSheet, _updateCurrentSheet] = useState<Map<string, CellData> | undefined>();
  const [sheetList, _updateSheetList] = useState<string[]>([]);
  const [currentSheetName, _setCurrentSheetName] = useState<string>("");
  const [compareSheetName, _setCompareSheetName] = useState<string>("");
  const [compareValueColumn, _setCompareValueColumn] = useState<string>("A");
  const [replaceValueColumn, _setReplaceValueColumn] = useState<string>("B");
  const [topOffset, _setTopOffset] = useState(0);
  const [leftOffset, _setLeftOffset] = useState(0);
  const [maxRows, _setMaxRows] = useState(25);
  const [maxColumns, _setMaxColumns] = useState(25);

  // selection / editing
  const [selectedCellId, _setSelectedCellId] = useState<string>("");
  const [editingCellId, _setEditingCellId] = useState<string>("");

  // Central editor buffer manager: only one buffer exists while editing
  const [editingBuffer, _setEditingBuffer] = useState<string | null>(null);

  // Central cancel guard for edit/cancel semantics
  const editCancelledRef = useRef(false);

  // helper to parse "r_c" id into numbers
  function parseCellId(id: string) {
    const parts = id.split("_");
    if (parts.length !== 2) return { row: 0, column: 0 };
    return { row: parseInt(parts[0], 10), column: parseInt(parts[1], 10) };
  }

  function addNewSheet(sheetName: string) {
    if (workbook.current.has(sheetName)) {
      window.alert("The sheet name that you specified already exists. Please use a different sheet name!");
      return;
    }
    workbook.current.set(sheetName, new Map());
    sheetList.push(sheetName);
    _updateSheetList(Array.from(sheetList));
  }

  function removeSheet(sheetName: string) {
    const sheetIndex = sheetList.indexOf(sheetName);
    if (sheetIndex > -1) {
      setCurrentSheet("");
      workbook.current.delete(sheetName);
      const newList = sheetList.filter((x) => { return x != sheetName; });
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
      wb.SheetNames.forEach((sn_raw) => {
        let sn = sn_raw;
        if (workbook.current.has(sn)) {
          sn = sn + "_copy";
        }
        addNewSheet(sn);
        const sheetToAppendTo = workbook.current.get(sn);
        const sheetContents = utils.sheet_to_json<string[]>(wb.Sheets[sn], {header: 1});
        sheetContents.forEach((sheetRow, rowNum) => {
          sheetRow.forEach((cellContent, colNum) => {
            sheetToAppendTo?.set(rowNum + "_" + colNum, { row : rowNum, column : colNum, value : cellContent });
          });
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
    writeFile(wb, "워크시트.xlsx");
  }

  function applyWorksheet() {
    if (workbook.current.size == 0) {
      window.alert("Current workspace is empty, so there is nothing to save!");
      return;
    }
    if (!workbook.current.has(compareSheetName)) {
      window.alert("Please select a valid sheet that contains find/replace values!");
      return;
    }
    const findColumn = columnNameToIndex(compareValueColumn);
    const replaceColumn = columnNameToIndex(replaceValueColumn);
    if (findColumn == -1 || replaceColumn == -1) {
      window.alert("Please specify a valid column!");
      return;
    }
    const refSheet = workbook.current.get(compareSheetName);
    if (refSheet == null || refSheet == undefined) {
      window.alert("The specified find/replace sheet is null. Please specify a valid one!");
      return;
    }
    const replaceWorker = new Worker();
    replaceWorker.postMessage([workbook.current, compareSheetName, findColumn, replaceColumn]);
    replaceWorker.onmessage = (e) => {
      console.log("OnMessage");
      console.log(e.data);
      const { type, resultWorkbook, changeCount, message } = e.data;
      if (type == -1) {
        window.alert(message);
      } else if (type == 0) {
        return;
      } else if (type == 1 && resultWorkbook != null) {
        const newWkMap = resultWorkbook as Map<string, Map<string, CellData>>;
        workbook.current = new Map(newWkMap);
        window.alert(changeCount + " cells affected!");
        setCurrentSheet("");
      }
      replaceWorker.terminate();
    };
  }

  function handleClear(): void {
    clearCurrentWorksheet();
  }

  function adjustDisplaySize(clientHeight : number, scrollTop : number,
      scrollHeight : number, clientWidth : number,
      scrollLeft : number, scrollWidth : number) {
    if (clientHeight + scrollTop >= scrollHeight) {
      _setMaxRows(maxRows + 50);
    } else if (scrollTop == 0) {
      _setMaxRows(Math.max(25));
    }
    if (clientWidth + scrollLeft >= scrollWidth) {
      _setMaxColumns(maxColumns + 50);
    } else if (scrollLeft == 0) {
      _setMaxColumns(25);
    }
  }

  function indexToColumnName(index: number): string {
    let col = "";
    let i = index + 1;
    while (i > 0) {
      const rem = (i - 1) % 26;
      col = String.fromCharCode(65 + rem) + col;
      i = Math.floor((i - 1) / 26);
    }
    return col;
  }

  function columnNameToIndex(name: string): number {
    if (!name) return -1;
    const s = name.toUpperCase().replace(/[^A-Z]/g, "");
    if (s.length === 0) return -1;
    let idx = 0;
    for (let i = 0; i < s.length; i++) {
      idx = idx * 26 + (s.charCodeAt(i) - 65 + 1);
    }
    return idx - 1;
  }

  // selection handlers
  function handleSelectCell(id: string) {
    _setSelectedCellId(id);
  }

  // Start editing: create central buffer and set edit id
  function handleRequestEdit(id: string) {
    //const { row, column } = parseCellId(id);
    if (editingCellId != id) {
      const value = currentSheet?.get(id)?.value ?? "";
      editCancelledRef.current = false; // reset cancel guard
      _setEditingCellId(id);
      _setEditingBuffer(value);
      _setSelectedCellId(id);
    }
  }

  // update central buffer while typing
  function handleUpdateEditingBuffer(text: string) {
    _setEditingBuffer(text);
  }

  // commit: write buffer to workbook and clear buffer/id
  function handleCommitEditFromChild(id?: string) {
    // id optional: if provided ensure matching editingCellId
    const targetId = id ?? editingCellId;
    if (!targetId) {
      _setEditingCellId("");
      _setEditingBuffer(null);
      return;
    }
    const { row, column } = parseCellId(targetId);
    const value = editingBuffer ?? "";
    addOrModifyCurrentSheetCell(targetId, { row, column, value });
    _setEditingCellId("");
    _setEditingBuffer(null);
    editCancelledRef.current = false;
  }

  // cancel: mark cancelled and clear buffer/id
  function handleCancelEditFromChild() {
    editCancelledRef.current = true;
    _setEditingCellId("");
    _setEditingBuffer(null);
  }

  // handle blur coming from child cell: commit or honor cancel centrally, then deselect
  function handleCellBlurFromChild(id: string) {
    // If a cancel was requested, clear the flag and do not commit
    if (editCancelledRef.current) {
      editCancelledRef.current = false;
      _setSelectedCellId(""); // deselect after cancel
      return;
    }
    // If the blurred cell was the one being edited, commit
    if (editingCellId === id) {
      handleCommitEditFromChild(id);
    }
    // finally deselect (user requested cell lost focus)
    _setSelectedCellId("");
  }

  return (
    <div>
      <div className={styles.buttonContainer}>
        <label htmlFor="fileSelector">
          <h4>파일 선택</h4>
        </label>
        <input id="fileSelector" type="file" style={{ display: "none" }} onChange={(ev) => { ev.target.files != null ? fileLoad(ev.target.files[0]) : window.alert("The selected file is null"); ev.target.files = null; }}></input>
        <button type="button" onClick={handleClear}>지우기</button>
        <button type="button" onClick={() => { exportCurrentWorkbook() }}>저장</button>
      </div>
      <div className={styles.buttonContainer}>
        <select name="sheetName" className={styles.sheetSelector} value={currentSheetName} onChange={(ev) => { setCurrentSheet(ev.target.value); }}>
          <option value="" >시트를 선택해 주세요</option>
          {sheetList.map(x => (<option value={x} key={x}>{x}</option>))}
        </select>
        <button type="button" className={styles.statHandlerButton} onClick={() => { removeSheet(currentSheetName); }}>시트 삭제</button>
      </div>
      <div className={styles.buttonContainer}>
        <input type="text" className={styles.addSheetTextbox} onChange={(x) => { _setNewSheetName(x.target.value); }} value={newSheetName}></input>
        <button type="button" className={styles.statHandlerButton} onClick={() => { addNewSheet(newSheetName); }}>시트 추가</button>
      </div>
      <div className={styles.buttonContainer}>
        <select name="sheetName" className={styles.statHandlerButton} value={compareSheetName} onChange={(ev) => { _setCompareSheetName(ev.target.value); }}>
          <option value="" >검색/변경값이 있는 시트를 선택해 주세요</option>
          {sheetList.map(x => (<option value={x} key={x}>{x}</option>))}
        </select>
        <div> 검색값 열 : </div>
        <input type="text" className={styles.statHandlerButton} onChange={(x) => { _setCompareValueColumn(x.target.value); }} value={compareValueColumn}></input>
        <div> 교체값 열 : </div>
        <input type="text" className={styles.statHandlerButton} onChange={(x) => { _setReplaceValueColumn(x.target.value); }} value={replaceValueColumn}></input>
        <button type="button" className={styles.statHandlerButton} onClick={() => { applyWorksheet(); }}>적용</button>
      </div>
      <div className={styles.tableContainer} onScroll={(ev) => 
          { const currTarget = ev.currentTarget; 
            adjustDisplaySize(currTarget.clientHeight, currTarget.scrollTop, currTarget.scrollHeight, currTarget.clientWidth, currTarget.scrollLeft, currTarget.scrollWidth) }}>
        <table>
        {currentSheet != undefined ? 
        (<>
          <thead>
            <tr>
              <th className={styles.corner}></th>
              {Array.from({ length: (maxColumns - leftOffset) }, (_2, ci) => {
                const colIndex = ci + leftOffset;
                return <th key={"H_" + colIndex} className={styles.stickyHeader}>{indexToColumnName(colIndex)}</th>
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: (maxRows - topOffset) }, (_, ri) => {
              const absRow = ri + topOffset;
              return (
              <tr key={"ROW_" + absRow}>
                <td className={styles.stickyColumn}>{absRow + 1}</td>
                {Array.from({ length: maxColumns - leftOffset }, (_2, ci) => {
                  const absCol = ci + leftOffset;
                  const id = absRow + "_" + absCol;
                  const value = currentSheet.get(id)?.value ?? "";
                  return (
                    <CellItem
                      key={id}
                      id={id}
                      cellValue={value}
                      // commit will be handled centrally; pass commit handler
                      onCommit={() => handleCommitEditFromChild(id)}
                      onUpdateBuffer={(txt) => handleUpdateEditingBuffer(txt)}
                      onRequestEdit={() => handleRequestEdit(id)}
                      onCancelRequest={() => handleCancelEditFromChild()}
                      onPaste={(pv) => { pasteToTable(pv, absRow, absCol); }}
                      selected={selectedCellId === id}
                      isEditing={editingCellId === id}
                      editingBuffer={editingCellId === id ? editingBuffer : null}
                      onSelect={handleSelectCell}
                      onBlurNotify={(cellId) => handleCellBlurFromChild(cellId)}
                    />
                  )
                })}
              </tr>
            )})}
          </tbody>
        </>) 
        : 
        (<>
          <thead>
            <tr>
              <th>시트를 새로 추가해 주세요!</th>
            </tr>
          </thead>
        </>)
        }
        </table>
      </div>
    </div>
  );
}