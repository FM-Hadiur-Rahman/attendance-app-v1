// api/Content.tsx

export interface Content {
  id: string;
  title: "aboutUs" | "privacy" | "terms";
  body: string;
}

export const contents: Content[] = [
  {
    id: "1",
    title: "aboutUs",
    body: `Welcome to Time Track – a smart and modern workforce management system designed for businesses to easily manage employees, schedules, and attendance across multiple branches.

Time Track helps Super Admins, Admins, and Employees stay connected with accurate, secure, and real-time information.

Super Admins can create and manage branches, assign managers, and monitor attendance across all locations. Admins can add employees, assign weekly schedules, track attendance, and transfer employees between branches. Employees can check in only within their assigned schedule location (within a 10-meter GPS radius), view their schedules, track their working hours, and receive notifications about new schedules or branch changes.

Our mission is to bring transparency, accuracy, and automation to workforce management, helping businesses improve productivity and reduce manual errors.

Time Track — Smart, Secure, and Real-Time Attendance Management.`,
  },
  {
    id: "2",
    title: "privacy",
    body: `
1. Information We Collect
- User profile details (name, contact info, login credentials created by Admin)
- Employee schedules and branch assignments
- Real-time GPS location only during check-in and check-out
- Device information (device ID, OS)
- Usage logs such as check-in/check-out time and notifications

2. How We Use Your Information
- Verify employee location during check-in/check-out (10-meter radius)
- Prevent attendance fraud
- Manage schedules, branches, and employee transfers
- Notify Admins and Employees about schedule updates, transfers, or attendance events
- Improve app functionality and security

3. Location Access
Time Track uses your GPS location ONLY during check-in and check-out.  
We do NOT track location in the background.

4. Data Sharing
We do not sell your data.  
Data is shared only with:
- Super Admins (for monitoring)
- Admins/Managers (for schedule & attendance management)
- Legal authorities if required

5. Data Security
We use secure databases, encrypted communication, and access control.  
However, no method is 100% secure, and we cannot guarantee absolute protection.

6. Your Rights
Employees can request correction or deletion of their profile data through their Admin (subject to company policy).

7. Changes to Policy
We may update this policy periodically. Continued use of the app means you accept the updated policy.`,
  },
  {
    id: "3",
    title: "terms",
    body: `Terms of Service – Time Track

1. Acceptance of Terms
By using the Time Track app, you agree to follow all rules and guidelines described in these Terms.

2. User Roles
Super Admin:
- Create branches and assign managers
- Monitor all branches and employee activity

Admin:
- Create employee profiles and weekly schedules
- Edit or transfer employees between branches
- Monitor check-in/check-out activity

Employee:
- Log in using credentials provided by Admin
- Check in only at the assigned branch location (within 10 meters)
- Check out only at the scheduled end time
- View schedules and working hours

3. Prohibited Activities
- Fake GPS or location spoofing
- Sharing login credentials
- Checking in at unauthorized locations
- Any action that manipulates or falsifies attendance data

4. App Availability
We aim to provide uninterrupted service but do not guarantee continuous access or error-free functionality.

5. Limitation of Liability
Time Track is not responsible for:
- GPS inaccuracies
- Network or device issues
- Loss of data due to device failure or misuse

6. Termination
We may suspend or terminate accounts for misuse, violation of rules, or fraudulent activity.

7. Changes to Terms
These Terms may be updated periodically. Continued use of the app means you agree to the new Terms.

8. Governing Law
These Terms are governed by applicable local laws of your region.`,
  },
];
