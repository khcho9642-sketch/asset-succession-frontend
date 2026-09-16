import type { Metadata } from "next";
import { PublicNav } from "@/components/PublicNav";
import { SimpleTaxCalculator } from "./SimpleTaxCalculator";
import styles from "./calculator.module.css";

export const metadata: Metadata = {
  title: "상속·증여·양도소득세 간편계산기 | 자산승계 360",
  description: "자산승계 360 안에서 상속세, 증여세, 양도소득세 예상 세액을 직접 입력하고 계산합니다.",
};

export default function CalculatorPage() {
  return (
    <div className={styles.page}>
      <PublicNav />
      <main className={styles.shell}>
        <SimpleTaxCalculator />
      </main>
    </div>
  );
}
