// api/Branch.tsx

export interface Branch {
  id: string;
  name: string;
  location: {
  latitude: number;
  longitude: number;
  };
}
export const getBranchById = (id: string) => branches.find(branch => branch.id === id);

export const branches: Branch[] = [
  {
    id: "B001",
    name: "Main Bakery - Jaffna",
    location: { latitude: 9.6615, longitude: 80.0255 },
  },
  {
    id: "B002",
    name: "Colombo Central",
    location: { latitude: 6.9271, longitude: 79.8612 },
  },
  {
    id: "B003",
    name: "Negombo Branch",
    location: { latitude: 7.2083, longitude: 79.8358 },
  },
  {
    id: "B004",
    name: "Kandy Branch",
    location: { latitude: 7.2906, longitude: 80.6337 },
  },
  {
    id: "B005",
    name: "Trincomalee Branch",
    location: { latitude: 8.5874, longitude: 81.2152 },
  },
  {
    id: "B006",
    name: "Batticaloa Branch",
    location: { latitude: 7.7170, longitude: 81.7000 },
  },
  {
    id: "B007",
    name: "Galle Branch",
    location: { latitude: 6.0535, longitude: 80.2210 },
  },
  {
    id: "B008",
    name: "Vavuniya Branch",
    location: { latitude: 8.7514, longitude: 80.4971 },
  },
  {
    id: "B009",
    name: "Mannar Branch",
    location: { latitude: 8.9770, longitude: 79.9090 },
  },
  {
    id: "B010",
    name: "Kurunegala Branch",
    location: { latitude: 7.4863, longitude: 80.3647 },
  },
  {
    id: "B011",
    name: "Anuradhapura Branch",
    location: { latitude: 8.3122, longitude: 80.4037 },
  },
  {
    id: "B012",
    name: "Matara Branch",
    location: { latitude: 5.9485, longitude: 80.5350 },
  },
   {
    id: "68ff0965bc7c653e0d3ca48c",
    name: "meesalai Branch",
    location: { latitude: 9.676931, longitude: 80.186981 },
  },
];
