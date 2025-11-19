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
    body: `Welcome to the official Attendance App – your fast and easy way to enjoy your favorite Italian dishes from Attendance in Bonn-Bad Godesberg!

Whether you’re craving crispy pizzas, fresh pastas, hearty meat dishes, or delicious seafood, our app brings the full taste of Italy right to your fingertips.

Order your favorite meals for delivery or pickup, customize your dishes, and enjoy exclusive app-only offers. With just a few taps, you can explore our complete menu, track your orders in real-time, and experience the same great taste and service Attendance has been known for since day one.

Attendance – Italian Tradition, Delivered Fresh!`,
  },
  {
    id: "2",
    title: "privacy",
    body: `
1. Use of the App
The Attendance App allows you to browse our menu, place takeaway or dine-in orders, and conveniently manage your food experience. By using the App, you agree to use it only for lawful purposes and in accordance with these Terms.

2. User Accounts
To access certain features of the App, you may need to create an account. You are responsible for maintaining the confidentiality of your login credentials and for all activities under your account. Please ensure your account information is accurate and up to date.

3. Orders and Payments
All orders placed through the App are subject to availability and confirmation. Prices listed include applicable taxes unless otherwise specified. Payments can be made securely through the App using the available payment options. Attendance reserves the right to refuse or cancel any order at our discretion.

4. Cancellations and Refunds
Currently, orders placed via the Attendance App cannot be canceled or modified once confirmed. Please review your order carefully before finalizing your purchase. If you experience any issues with your order (such as missing or incorrect items), please contact our support team promptly. We will do our best to resolve the matter.

5. Promotions and Offers
From time to time, Attendance may offer special promotions or discounts through the App. These offers are subject to change or withdrawal without notice and may have additional terms and conditions.

6. User Conduct
You agree not to misuse the App, disrupt its functionality, or attempt unauthorized access to our systems. Any behavior deemed harmful, abusive, or fraudulent may lead to account suspension, termination, or legal action.

7. Privacy
We value your privacy and are committed to protecting your personal data. For information on how we collect, use, and store your data, please refer to our [Privacy Policy].

8. Intellectual Property
All content within the App—including logos, text, images, and design—is the property of Attendance and protected under intellectual property laws. You may not copy, reproduce, or use our content without prior written consent.

9. Changes to the Terms
We may update these Terms from time to time to reflect changes in our services or legal requirements. Significant changes will be communicated via the App or by email. Continued use of the App after updates means you accept the revised Terms.

10. Disclaimer and Limitation of Liability
While we aim to provide accurate and reliable services, we do not guarantee the App will always function without errors or interruptions. Attendance is not liable for any direct, indirect, incidental, or consequential damages resulting from your use of the App.

11. Governing Law
These Terms are governed by and interpreted in accordance with the laws of Germany, without regard to its conflict of law provisions.
`,
  },
  {
    id: "3",
    title: "terms",
    body: `Terms of Service – Attendance Food App

1. Use of the App
The Attendance App allows you to browse our menu, place takeaway or dine-in orders, and manage your food experience. 
By using the App, you agree to use it only for lawful purposes.

2. User Accounts
To access certain features of the App, you may need to create an account. You are responsible for maintaining the confidentiality of your login credentials and for all activities under your account. Please ensure your account information is accurate and up to date.

3. Orders and Payments
All orders placed through the App are subject to availability and confirmation. Prices listed include applicable taxes unless otherwise specified. Payments can be made securely through the App using the available payment options. Attendance reserves the right to refuse or cancel any order at our discretion.

4. Cancellations and Refunds
Currently, orders placed via the Attendance App cannot be canceled or modified once confirmed. Please review your order carefully before finalizing your purchase. If you experience any issues with your order (such as missing or incorrect items), please contact our support team promptly. We will do our best to resolve the matter.

5. Promotions and Offers
From time to time, Attendance may offer special promotions or discounts through the App. These offers are subject to change or withdrawal without notice and may have additional terms and conditions..

6. User Conduct
You agree not to misuse the App, disrupt its functionality, or attempt unauthorized access to our systems. Any behavior deemed harmful, abusive, or fraudulent may lead to account suspension, termination, or legal action.

7. Privacy
We value your privacy and are committed to protecting your personal data. For information on how we collect, use, and store your data, please refer to our [Privacy Policy].

8. Intellectual Property
All content within the App—including logos, text, images, and design—is the property of Attendance and protected under intellectual property laws. You may not copy, reproduce, or use our content without prior written consent.

9. Changes to the Terms
We may update these Terms from time to time to reflect changes in our services or legal requirements. Significant changes will be communicated via the App or by email. Continued use of the App after updates means you accept the revised Terms.

10. Disclaimer and Limitation of Liability
While we aim to provide accurate and reliable services, we do not guarantee the App will always function without errors or interruptions. Attendance is not liable for any direct, indirect, incidental, or consequential damages resulting from your use of the App.

11. Governing Law
These Terms are governed by and interpreted in accordance with the laws of Germany, without regard to its conflict of law provisions.

`,
  },
];
