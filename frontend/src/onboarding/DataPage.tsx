// First version for task 3.1. Task 3.5 polishes it.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteData, exportData } from "@/api/client";
import { useApp } from "@/app/store";
import { PageTitle } from "@/app/ui";

export default function DataPage() {
  const { userId, reset } = useApp();
  const [confirming, setConfirming] = useState(false);
  const navigate = useNavigate();

  const download = async () => {
    const data = await exportData(userId!);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai4brain-my-data.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = async () => {
    await deleteData(userId!);
    reset();
    navigate("/welcome", { replace: true });
  };

  return (
    <>
      <PageTitle sub="Everything we keep about you, and how to take it back.">My data</PageTitle>
      <div className="space-y-4">
        <section className="card">
          <h2 className="text-lg font-semibold">Export my data</h2>
          <p className="mt-1 text-slate-600">Download everything we recorded as a JSON file.</p>
          <button className="btn-ghost mt-3" onClick={download}>
            Download
          </button>
        </section>
        <section className="card">
          <h2 className="text-lg font-semibold">Delete my data</h2>
          <p className="mt-1 text-slate-600">This removes your games, scores and coach reviews for good.</p>
          {!confirming ? (
            <button className="btn-ghost mt-3" onClick={() => setConfirming(true)}>
              Delete my data
            </button>
          ) : (
            <div className="mt-3 flex flex-wrap gap-3">
              <button className="btn-primary" onClick={remove}>
                Yes, delete everything
              </button>
              <button className="btn-ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
