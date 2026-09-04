import { mockNotice } from "@/lib/mockData";

export function MockNotice() {
  return (
    <div className="mock-notice" role="note">
      <span>Mock only</span>
      <p>{mockNotice}</p>
    </div>
  );
}
