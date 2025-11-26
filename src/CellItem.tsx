import { useRef, useState } from "react";

export default function CellItem({ cellValue, onValueChange, onPaste }: CellItemProps) {
  const [editMode, setEditMode] = useState(false);
  const editValue = useRef("");
  const [selected, setSelected] = useState(false);

  function toggleEditMode() {
    if (editMode) {
      onValueChange(editValue.current);
      setEditMode(false);
      editValue.current = "";
    } else {
      editValue.current = cellValue;
      setEditMode(true);
    }
  }

  return (
    <>
      <td contentEditable={editMode} onPaste={(ev => { if (!editMode) { ev.preventDefault(); onPaste(ev.clipboardData.getData("text/plain")); } })} onInput={(ev) => { const nv = ev.currentTarget.textContent; editValue.current = nv; }} onDoubleClick={() => { toggleEditMode(); }}>
        {editMode ? editValue.current : cellValue}
      </td>
    </>
  )
}
export interface CellItemProps { cellValue: string, onValueChange: (newValue: string) => void, onPaste: (pasteValue: string) => void }
export interface CellData { row: number, column: number, value: string }