import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { getAttendanceReport, AttendanceReportRow } from "../api/attendanceReport";
import { showErrorToast, showSuccessToast } from "./Toast";

export const exportMonthlyAttendanceXLSX = async (employeeId: string) => {
  try {
    if (!employeeId) {
      showErrorToast("Missing employee ID");
      return;
    }

    // Current month start/end
    const now = new Date();
    const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const startDate = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    // Fetch attendance records
    const records = await getAttendanceReport({
      employeeId,
      startDate,
      endDate,
    });

    if (!records || records.length === 0) {
      showErrorToast("No attendance records found for this month");
      return;
    }

    // Prepare sheet data dynamically, skipping employeeId, username, branchId
    const sheetData = records.map((item) => {
      const row: Record<string, string> = {};
      Object.keys(item).forEach((key) => {
        if (["employeeId", "username", "branchId"].includes(key)) return;

        let value = (item[key as keyof AttendanceReportRow] ?? "") as string;

        // If key is actualIn or actualOut, extract only time
        if ((key === "actualIn" || key === "actualOut") && value) {
          // Assuming format is "YYYY-MM-DD HH:MM:SS"
          const parts = value.split(" ");
          value = parts[1] || value; // take only HH:MM:SS
        }

        row[key] = value;
      });
      return row;
    });

    // Create workbook
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");

    // Convert workbook to base64
    const aboutBase64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });

    // Use first record's fullname or default
    const fullnameRaw = records[0]?.fullname || "attendance";
    const safeFullname = fullnameRaw.replace(/[^a-zA-Z0-9_-]/g, "_");

    // Create file name & URI
    const fileName = `attendance_${safeFullname}_${now.getFullYear()}-${pad2(
      now.getMonth() + 1
    )}.xlsx`;
    const fileUri = FileSystem.documentDirectory + fileName;

    // Write file (legacy API)
    await FileSystem.writeAsStringAsync(fileUri, aboutBase64, {
      encoding: "base64",
    });

    // Share file
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        dialogTitle: "Monthly Attendance Report",
      });
    }

    showSuccessToast("Monthly attendance exported successfully!");
  } catch (err) {
    console.error("XLSX Export Error:", err);
    showErrorToast("Failed to export attendance Excel file");
  }
};
