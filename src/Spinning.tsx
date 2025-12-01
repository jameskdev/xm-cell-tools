import styles from "./Spinning.module.css"
import spinningImage from "./spinning.svg"

export default function Spinning() {
    return (
        <>
        <img src={spinningImage} className={styles.loadingSpin}></img>
        </>
    )
}