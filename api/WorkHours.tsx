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
    id: "WH001",
    user_id: "U001",
    check_in: "08:02:00",
    check_out: "15:05:00",
    date: "2025-10-10",
    createDate: "2025-10-10T08:02:00Z",
    updateDate: "2025-10-10T08:02:00Z"
  },
  {
    id: "WH002",
    user_id: "U002",
    check_in: "09:01:00",
    check_out: "15:10:00",
    date: "2025-10-12",
    createDate: "2025-10-10T09:01:00Z",
    updateDate: "2025-10-10T09:01:00Z"
  },
  {
    id: "WH003",
    user_id: "U003",
    check_in: "08:05:00",
    check_out: "15:08:00",
    date: "2025-10-11",
    createDate: "2025-10-10T08:05:00Z",
    updateDate: "2025-10-10T08:05:00Z"
  },
  {
    id: "WH004",
    user_id: "U004",
    check_in: "07:55:00",
    check_out: "14:58:00",
    date: "2025-10-16",
    createDate: "2025-10-10T07:55:00Z",
    updateDate: "2025-10-10T07:55:00Z"
  },
  {
    id: "WH005",
    user_id: "U005",
    check_in: "08:10:00",
    check_out: "15:12:00",
    date: "2025-10-12",
    createDate: "2025-10-10T08:10:00Z",
    updateDate: "2025-10-10T08:10:00Z"
  },
  {
    id: "WH006",
    user_id: "U006",
    check_in: "08:15:00",
    check_out: "15:20:00",
    date: "2025-10-14",
    createDate: "2025-10-10T08:15:00Z",
    updateDate: "2025-10-10T08:15:00Z"
  },
  {
    id: "WH007",
    user_id: "U007",
    check_in: "09:05:00",
    check_out: "15:10:00",
    date: "2025-10-18",
    createDate: "2025-10-10T09:05:00Z",
    updateDate: "2025-10-10T09:05:00Z"
  },
  {
    id: "WH008",
    user_id: "U008",
    check_in: "08:00:00",
    check_out: "15:02:00",
    date: "2025-10-20",
    createDate: "2025-10-10T08:00:00Z",
    updateDate: "2025-10-10T08:00:00Z"
  },
  {
    id: "WH009",
    user_id: "U009",
    check_in: "07:50:00",
    check_out: "14:55:00",
    date: "2025-10-18",
    createDate: "2025-10-10T07:50:00Z",
    updateDate: "2025-10-10T07:50:00Z"
  },
  {
    id: "WH010",
    user_id: "U010",
    check_in: "08:12:00",
    check_out: "15:18:00",
    date: "2025-10-19",
    createDate: "2025-10-10T08:12:00Z",
    updateDate: "2025-10-10T08:12:00Z"
  },
  {
    id: "WH011",
    user_id: "U011",
    check_in: "07:45:00",
    check_out: "15:00:00",
    date: "2025-10-11",
    createDate: "2025-10-10T07:45:00Z",
    updateDate: "2025-10-10T07:45:00Z"
  },
  {
    id: "WH012",
    user_id: "U012",
    check_in: "08:30:00",
    check_out: "15:30:00",
    date: "2025-10-15",
    createDate: "2025-10-10T08:30:00Z",
    updateDate: "2025-10-10T08:30:00Z"
  },
  {
    id: "WH013",
    user_id: "U013",
    check_in: "09:00:00",
    check_out: "16:00:00",
    date: "2025-10-16",
    createDate: "2025-10-10T09:00:00Z",
    updateDate: "2025-10-10T09:00:00Z"
  },
  {
    id: "WH014",
    user_id: "U014",
    check_in: "08:20:00",
    check_out: "15:25:00",
    date: "2025-10-22",
    createDate: "2025-10-10T08:20:00Z",
    updateDate: "2025-10-10T08:20:00Z"
  },
  {
    id: "WH015",
    user_id: "U015",
    check_in: "07:55:00",
    check_out: "15:00:00",
    date: "2025-10-13",
    createDate: "2025-10-10T07:55:00Z",
    updateDate: "2025-10-10T07:55:00Z"
  },
  {
    id: "WH016",
    user_id: "U016",
    check_in: "08:10:00",
    check_out: "15:15:00",
    date: "2025-10-17",
    createDate: "2025-10-10T08:10:00Z",
    updateDate: "2025-10-10T08:10:00Z"
  },
  {
    id: "WH017",
    user_id: "U017",
    check_in: "08:05:00",
    check_out: "15:10:00",
    date: "2025-10-19",
    createDate: "2025-10-10T08:05:00Z",
    updateDate: "2025-10-10T08:05:00Z"
  },
  {
    id: "WH018",
    user_id: "U018",
    check_in: "07:50:00",
    check_out: "14:55:00",
    date: "2025-10-22",
    createDate: "2025-10-10T07:50:00Z",
    updateDate: "2025-10-10T07:50:00Z"
  },
  {
    id: "WH019",
    user_id: "U019",
    check_in: "08:00:00",
    check_out: "15:05:00",
    date: "2025-10-21",
    createDate: "2025-10-10T08:00:00Z",
    updateDate: "2025-10-10T08:00:00Z"
  },
  {
    id: "WH020",
    user_id: "U020",
    check_in: "08:15:00",
    check_out: "15:20:00",
    date: "2025-10-23",
    createDate: "2025-10-10T08:15:00Z",
    updateDate: "2025-10-10T08:15:00Z"
  },
  {
    id: "WH021",
    user_id: "U021",
    check_in: "08:05:00",
    check_out: "15:10:00",
    date: "2025-10-13",
    createDate: "2025-10-10T08:05:00Z",
    updateDate: "2025-10-10T08:05:00Z"
  },
  {
    id: "WH022",
    user_id: "U022",
    check_in: "07:55:00",
    check_out: "15:00:00",
    date: "2025-10-16",
    createDate: "2025-10-10T07:55:00Z",
    updateDate: "2025-10-10T07:55:00Z"
  },
  {
    id: "WH023",
    user_id: "U023",
    check_in: "08:20:00",
    check_out: "15:25:00",
    date: "2025-10-17",
    createDate: "2025-10-10T08:20:00Z",
    updateDate: "2025-10-10T08:20:00Z"
  },
  {
    id: "WH024",
    user_id: "U024",
    check_in: "08:10:00",
    check_out: "15:12:00",
    date: "2025-10-23",
    createDate: "2025-10-10T08:10:00Z",
    updateDate: "2025-10-10T08:10:00Z"
  },
  {
    id: "WH025",
    user_id: "U025",
    check_in: "07:45:00",
    check_out: "15:00:00",
    date: "2025-10-14",
    createDate: "2025-10-10T07:45:00Z",
    updateDate: "2025-10-10T07:45:00Z"
  },
  {
    id: "WH026",
    user_id: "U026",
    check_in: "08:30:00",
    check_out: "15:35:00",
    date: "2025-10-21",
    createDate: "2025-10-10T08:30:00Z",
    updateDate: "2025-10-10T08:30:00Z"
  },
  {
    id: "WH027",
    user_id: "U027",
    check_in: "07:50:00",
    check_out: "15:00:00",
    date: "2025-10-17",
    createDate: "2025-10-10T07:50:00Z",
    updateDate: "2025-10-10T07:50:00Z"
  },
  {
    id: "WH028",
    user_id: "U028",
    check_in: "08:15:00",
    check_out: "15:20:00",
    date: "2025-10-18",
    createDate: "2025-10-10T08:15:00Z",
    updateDate: "2025-10-10T08:15:00Z"
  },
  {
    id: "WH029",
    user_id: "U029",
    check_in: "09:00:00",
    check_out: "15:55:00",
    date: "2025-10-19",
    createDate: "2025-10-10T09:00:00Z",
    updateDate: "2025-10-10T09:00:00Z"
  },
  {
    id: "WH030",
    user_id: "U030",
    check_in: "08:25:00",
    check_out: "15:28:00",
    date: "2025-10-21",
    createDate: "2025-10-10T08:25:00Z",
    updateDate: "2025-10-10T08:25:00Z"
  },
  {
    id: "WH031",
    user_id: "U031",
    check_in: "08:05:00",
    check_out: "15:10:00",
    date: "2025-10-14",
    createDate: "2025-10-10T08:05:00Z",
    updateDate: "2025-10-10T08:05:00Z"
  },
  {
    id: "WH032",
    user_id: "U032",
    check_in: "07:50:00",
    check_out: "15:00:00",
    date: "2025-10-18",
    createDate: "2025-10-10T07:50:00Z",
    updateDate: "2025-10-10T07:50:00Z"
  },
  {
    id: "WH033",
    user_id: "U033",
    check_in: "08:10:00",
    check_out: "15:15:00",
    date: "2025-10-23",
    createDate: "2025-10-10T08:10:00Z",
    updateDate: "2025-10-10T08:10:00Z"
  },
  {
    id: "WH034",
    user_id: "U034",
    check_in: "08:00:00",
    check_out: "15:08:00",
    date: "2025-10-24",
    createDate: "2025-10-10T08:00:00Z",
    updateDate: "2025-10-10T08:00:00Z"
  },
  {
    id: "WH035",
    user_id: "U035",
    check_in: "07:45:00",
    check_out: "15:00:00",
    date: "2025-10-25",
    createDate: "2025-10-10T07:45:00Z",
    updateDate: "2025-10-10T07:45:00Z"
  },
  {
    id: "WH036",
    user_id: "U036",
    check_in: "08:30:00",
    check_out: "15:35:00",
    date: "2025-10-26",
    createDate: "2025-10-10T08:30:00Z",
    updateDate: "2025-10-10T08:30:00Z"
  },
  {
    id: "WH037",
    user_id: "U037",
    check_in: "07:55:00",
    check_out: "15:00:00",
    date: "2025-10-11",
    createDate: "2025-10-10T07:55:00Z",
    updateDate: "2025-10-10T07:55:00Z"
  },
  {
    id: "WH038",
    user_id: "U038",
    check_in: "08:20:00",
    check_out: "15:25:00",
    date: "2025-10-17",
    createDate: "2025-10-10T08:20:00Z",
    updateDate: "2025-10-10T08:20:00Z"
  },
  {
    id: "WH039",
    user_id: "U039",
    check_in: "08:05:00",
    check_out: "15:10:00",
    date: "2025-10-16",
    createDate: "2025-10-10T08:05:00Z",
    updateDate: "2025-10-10T08:05:00Z"
  },
  {
    id: "WH040",
    user_id: "U040",
    check_in: "08:10:00",
    check_out: "15:15:00",
    date: "2025-10-16",
    createDate: "2025-10-10T08:10:00Z",
    updateDate: "2025-10-10T08:10:00Z"
  }
];
