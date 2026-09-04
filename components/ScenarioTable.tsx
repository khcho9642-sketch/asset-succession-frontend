import { scenarioComparisons } from "@/lib/mockData";

export function ScenarioTable() {
  return (
    <div className="table-card">
      <table>
        <thead>
          <tr>
            <th>시나리오</th>
            <th>세부담</th>
            <th>가족 현금흐름</th>
            <th>복잡도</th>
            <th>검토상태</th>
          </tr>
        </thead>
        <tbody>
          {scenarioComparisons.map((scenario) => (
            <tr key={scenario.name}>
              <td>{scenario.name}</td>
              <td>{scenario.taxBurden}</td>
              <td>{scenario.familyCash}</td>
              <td>{scenario.complexity}</td>
              <td>
                <span className={`pill ${scenario.risk === "낮음" ? "safe" : "warn"}`}>
                  {scenario.risk}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
