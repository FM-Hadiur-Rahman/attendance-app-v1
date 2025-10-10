// api/WorkHours.tsx
export interface WorkHour {
  id: string;
  user_id: string;
  check_in: string;   // hh:mm:ss
  check_out: string;  // hh:mm:ss
  date: string;       // YYYY-MM-DD
  createDate: string; // ISO string
  updateDate: string; // ISO string
}

export let workHours: WorkHour[] = [
  {
    id: "W001",
    user_id: "U001",
    check_in: "08:55:00",
    check_out: "17:05:00",
    date: "2025-09-01",
    createDate: "2025-09-01T08:50:00Z",
    updateDate: "2025-09-01T17:10:00Z",
  },
  {
    id: "W002",
    user_id: "U002",
    check_in: "09:58:00",
    check_out: "18:10:00",
    date: "2025-09-01",
    createDate: "2025-09-01T09:45:00Z",
    updateDate: "2025-09-01T18:15:00Z",
  },
  {
    id: "W003",
    user_id: "U003",
    check_in: "07:50:00",
    check_out: "16:02:00",
    date: "2025-09-01",
    createDate: "2025-09-01T07:45:00Z",
    updateDate: "2025-09-01T16:10:00Z",
  },
  {
    id: "W004",
    user_id: "U004",
    check_in: "13:55:00",
    check_out: "22:05:00",
    date: "2025-09-02",
    createDate: "2025-09-02T13:50:00Z",
    updateDate: "2025-09-02T22:15:00Z",
  },
  {
    id: "W005",
    user_id: "U005",
    check_in: "05:55:00",
    check_out: "14:10:00",
    date: "2025-09-02",
    createDate: "2025-09-02T05:50:00Z",
    updateDate: "2025-09-02T14:15:00Z",
  },
  {
    id: "W006",
    user_id: "U006",
    check_in: "12:55:00",
    check_out: "21:05:00",
    date: "2025-09-02",
    createDate: "2025-09-02T12:50:00Z",
    updateDate: "2025-09-02T21:15:00Z",
  },
  {
    id: "W007",
    user_id: "U007",
    check_in: "06:58:00",
    check_out: "15:02:00",
    date: "2025-09-03",
    createDate: "2025-09-03T06:50:00Z",
    updateDate: "2025-09-03T15:10:00Z",
  },
  {
    id: "W008",
    user_id: "U008",
    check_in: "09:28:00",
    check_out: "17:34:00",
    date: "2025-09-03",
    createDate: "2025-09-03T09:20:00Z",
    updateDate: "2025-09-03T17:40:00Z",
  },
  {
    id: "W009",
    user_id: "U009",
    check_in: "14:55:00",
    check_out: "23:02:00",
    date: "2025-09-03",
    createDate: "2025-09-03T14:50:00Z",
    updateDate: "2025-09-03T23:10:00Z",
  },
  {
    id: "W010",
    user_id: "U010",
    check_in: "10:55:00",
    check_out: "19:05:00",
    date: "2025-09-04",
    createDate: "2025-09-04T10:50:00Z",
    updateDate: "2025-09-04T19:10:00Z",
  },
  {
    id: "W011",
    user_id: "U011",
    check_in: "08:52:00",
    check_out: "17:02:00",
    date: "2025-09-04",
    createDate: "2025-09-04T08:45:00Z",
    updateDate: "2025-09-04T17:10:00Z",
  },
  {
    id: "W012",
    user_id: "U012",
    check_in: "11:55:00",
    check_out: "20:10:00",
    date: "2025-09-04",
    createDate: "2025-09-04T11:45:00Z",
    updateDate: "2025-09-04T20:15:00Z",
  },
  {
    id: "W013",
    user_id: "U013",
    check_in: "07:52:00",
    check_out: "16:03:00",
    date: "2025-09-05",
    createDate: "2025-09-05T07:45:00Z",
    updateDate: "2025-09-05T16:10:00Z",
  },
  {
    id: "W014",
    user_id: "U014",
    check_in: "09:55:00",
    check_out: "18:07:00",
    date: "2025-09-05",
    createDate: "2025-09-05T09:50:00Z",
    updateDate: "2025-09-05T18:15:00Z",
  },
  {
    id: "W015",
    user_id: "U015",
    check_in: "13:55:00",
    check_out: "22:10:00",
    date: "2025-09-05",
    createDate: "2025-09-05T13:50:00Z",
    updateDate: "2025-09-05T22:15:00Z",
  },
  {
    id: "W016",
    user_id: "U016",
    check_in: "06:59:00",
    check_out: "15:03:00",
    date: "2025-09-06",
    createDate: "2025-09-06T06:50:00Z",
    updateDate: "2025-09-06T15:10:00Z",
  },
  {
    id: "W017",
    user_id: "U017",
    check_in: "12:58:00",
    check_out: "21:04:00",
    date: "2025-09-06",
    createDate: "2025-09-06T12:50:00Z",
    updateDate: "2025-09-06T21:10:00Z",
  },
  {
    id: "W018",
    user_id: "U018",
    check_in: "09:28:00",
    check_out: "17:31:00",
    date: "2025-09-06",
    createDate: "2025-09-06T09:20:00Z",
    updateDate: "2025-09-06T17:40:00Z",
  },
  {
    id: "W019",
    user_id: "U019",
    check_in: "05:55:00",
    check_out: "14:00:00",
    date: "2025-09-07",
    createDate: "2025-09-07T05:50:00Z",
    updateDate: "2025-09-07T14:10:00Z",
  },
  {
    id: "W020",
    user_id: "U020",
    check_in: "14:55:00",
    check_out: "23:05:00",
    date: "2025-09-07",
    createDate: "2025-09-07T14:50:00Z",
    updateDate: "2025-09-07T23:10:00Z",
  },
  {
    id: "W021",
    user_id: "U021",
    check_in: "07:55:00",
    check_out: "16:05:00",
    date: "2025-09-08",
    createDate: "2025-09-08T07:50:00Z",
    updateDate: "2025-09-08T16:10:00Z",
  },
  {
    id: "W022",
    user_id: "U022",
    check_in: "10:55:00",
    check_out: "19:07:00",
    date: "2025-09-08",
    createDate: "2025-09-08T10:50:00Z",
    updateDate: "2025-09-08T19:15:00Z",
  },
  {
    id: "W023",
    user_id: "U023",
    check_in: "12:59:00",
    check_out: "21:05:00",
    date: "2025-09-08",
    createDate: "2025-09-08T12:50:00Z",
    updateDate: "2025-09-08T21:10:00Z",
  },
  {
    id: "W024",
    user_id: "U024",
    check_in: "08:53:00",
    check_out: "17:01:00",
    date: "2025-09-09",
    createDate: "2025-09-09T08:45:00Z",
    updateDate: "2025-09-09T17:10:00Z",
  },
  {
    id: "W025",
    user_id: "U025",
    check_in: "06:59:00",
    check_out: "15:04:00",
    date: "2025-09-09",
    createDate: "2025-09-09T06:50:00Z",
    updateDate: "2025-09-09T15:10:00Z",
  },
  {
    id: "W026",
    user_id: "U026",
    check_in: "13:56:00",
    check_out: "22:06:00",
    date: "2025-09-09",
    createDate: "2025-09-09T13:50:00Z",
    updateDate: "2025-09-09T22:15:00Z",
  },
  {
    id: "W027",
    user_id: "U027",
    check_in: "09:57:00",
    check_out: "18:08:00",
    date: "2025-09-10",
    createDate: "2025-09-10T09:50:00Z",
    updateDate: "2025-09-10T18:15:00Z",
  },
  {
    id: "W028",
    user_id: "U028",
    check_in: "05:55:00",
    check_out: "14:03:00",
    date: "2025-09-10",
    createDate: "2025-09-10T05:50:00Z",
    updateDate: "2025-09-10T14:10:00Z",
  },
  {
    id: "W029",
    user_id: "U029",
    check_in: "12:58:00",
    check_out: "21:01:00",
    date: "2025-09-10",
    createDate: "2025-09-10T12:50:00Z",
    updateDate: "2025-09-10T21:10:00Z",
  },
  {
    id: "W030",
    user_id: "U030",
    check_in: "09:25:00",
    check_out: "17:33:00",
    date: "2025-09-11",
    createDate: "2025-09-11T09:20:00Z",
    updateDate: "2025-09-11T17:40:00Z",
  },
  {
    id: "W031",
    user_id: "U004",
    check_in: "1:55:00",
    check_out: "10:15:00",
    date: "2025-09-30",
    createDate: "2025-09-02T13:50:00Z",
    updateDate: "2025-09-02T22:15:00Z",
  },
  {
    id: "W032",
    user_id: "U004",
    check_in: "1:55:00",
    check_out: "10:15:00",
    date: "2025-09-04",
    createDate: "2025-09-02T13:50:00Z",
    updateDate: "2025-09-02T22:15:00Z",
  },
      {
    id: "W033",
    user_id: "U004",
    check_in: "1:55:00",
    check_out: "10:15:00",
    date: "2025-09-05",
    createDate: "2025-09-02T13:50:00Z",
    updateDate: "2025-09-02T22:15:00Z",
  },
  {
    id: "W034",
    user_id: "U004",
    check_in: "1:55:00",
    check_out: "10:15:00",
    date: "2025-09-06",
    createDate: "2025-09-02T13:50:00Z",
    updateDate: "2025-09-02T22:15:00Z",
  },
  {
    id: "W035",
    user_id: "U004",
    check_in: "1:55:00",
    check_out: "10:15:00",
    date: "2025-09-07",
    createDate: "2025-09-02T13:50:00Z",
    updateDate: "2025-09-02T22:15:00Z",
  },
  {
    id: "W036",
    user_id: "U004",
    check_in: "1:55:00",
    check_out: "10:15:00",
    date: "2025-09-08",
    createDate: "2025-09-02T13:50:00Z",
    updateDate: "2025-09-02T22:15:00Z",
  },
  {
    id: "W037",
    user_id: "U004",
    check_in: "1:55:00",
    check_out: "10:15:00",
    date: "2025-09-01",
    createDate: "2025-09-02T13:50:00Z",
    updateDate: "2025-09-02T22:15:00Z",
  },
    {
    id: "W038",
    user_id: "U004",
    check_in: "1:55:00",
    check_out: "10:15:00",
    date: "2025-08-31",
    createDate: "2025-09-02T13:50:00Z",
    updateDate: "2025-09-02T22:15:00Z",
  },
      {
    id: "W039",
    user_id: "U004",
    check_in: "1:55:00",
    check_out: "10:15:00",
    date: "2025-08-30",
    createDate: "2025-09-02T13:50:00Z",
    updateDate: "2025-09-02T22:15:00Z",
  },
        {
    id: "W040",
    user_id: "U004",
    check_in: "1:55:00",
    check_out: "10:15:00",
    date: "2025-09-09",
    createDate: "2025-09-02T13:50:00Z",
    updateDate: "2025-09-02T22:15:00Z",
  },
];

// ID generator
let counter = 1;
const generateId = () => `W${String(counter++).padStart(3, "0")}`;

// ✅ Format helpers
const formatTime = (d: Date) =>
  d.toLocaleTimeString("en-GB", { hour12: false }); // 08:55:00
const formatDate = (d: Date) => d.toISOString().split("T")[0]; // YYYY-MM-DD

// Add new record on Check-In
export const addWorkHour = (user_id: string, check_in: Date) => {
  const newWork: WorkHour = {
    id: generateId(),
    user_id,
    check_in: formatTime(check_in),
    check_out: "",
    date: formatDate(check_in),
    createDate: check_in.toISOString(),
    updateDate: check_in.toISOString(),
  };
  workHours.push(newWork);
  return newWork;
};

// Update record on Check-Out
export const updateWorkHour = (user_id: string, check_out: Date) => {
  const record = [...workHours].reverse().find(
    (w) => w.user_id === user_id && !w.check_out
  );
  if (record) {
    record.check_out = formatTime(check_out);
    record.updateDate = check_out.toISOString();
  }
  return record;
};