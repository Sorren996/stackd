export const ACKNOWLEDGMENT_VERSIONS = {
  acknowledgment_bundle_version: "1.0",
  terms_version: "1.0",
  privacy_notice_version: "1.0",
  medical_disclaimer_version: "1.0",
  emergency_notice_version: "1.0",
  insulin_estimate_notice_version: "1.0",
  insulin_settings_notice_version: "1.0",
  notification_notice_version: "1.0",
  health_data_consent_version: "1.0",
};

export const CHECKBOX_KEYS = [
  "terms_accepted",
  "privacy_notice_acknowledged",
  "medical_disclaimer_accepted",
  "emergency_notice_accepted",
  "insulin_estimate_notice_accepted",
  "insulin_settings_notice_accepted",
  "notification_notice_accepted",
  "health_data_consent_accepted",
];

export const DOCUMENT_KEYS = ["terms", "privacy"];

export const ACKNOWLEDGMENT_STEPS = [
  {
    id: 0,
    key: "welcome",
    label: "Welcome",
  },
  {
    id: 1,
    key: "terms-privacy",
    label: "Terms & Privacy",
    sections: [
      {
        title: "Terms of Use",
        notice: "Please take a moment to read the Stackd Terms of Use. Tap the link below to view the full document.",
        documentKey: "terms",
        checkboxId: "terms_accepted",
        checkboxLabel: "I have read and agree to the Stackd Terms of Use.",
      },
      {
        title: "Privacy Notice",
        notice: "Please review the Stackd Privacy Notice to understand how your health information is handled. Tap the link below to view the full document.",
        documentKey: "privacy",
        checkboxId: "privacy_notice_acknowledged",
        checkboxLabel: "I have read and acknowledge the Stackd Privacy Notice.",
      },
    ],
  },
  {
    id: 2,
    key: "medical-emergency",
    label: "Medical & Emergency",
    sections: [
      {
        title: "Medical-Use Disclaimer",
        notice: "Stackd is intended to help users record and visualize information related to glucose, carbohydrates, and insulin use. Stackd does not provide medical advice, diagnosis, or treatment and is not a substitute for guidance from a qualified healthcare professional.\n\nDo not start, stop, or change insulin, medication, carbohydrate treatment, or other medical care solely because of information displayed by Stackd.",
        checkboxId: "medical_disclaimer_accepted",
        checkboxLabel: "I understand that Stackd does not provide medical advice and that I should consult a qualified healthcare professional regarding treatment decisions.",
      },
      {
        title: "Emergency-Use Notice",
        notice: "Stackd is not an emergency service and does not continuously monitor your condition.\n\nIf you believe you are experiencing severe hypoglycemia, diabetic ketoacidosis, loss of consciousness, confusion, difficulty breathing, seizures, or another medical emergency, seek immediate medical assistance. Do not wait for an alert, estimate, or response from Stackd.",
        checkboxId: "emergency_notice_accepted",
        checkboxLabel: "I understand that Stackd is not an emergency monitoring or emergency response service.",
      },
    ],
  },
  {
    id: 3,
    key: "insulin",
    label: "Estimates & Settings",
    sections: [
      {
        title: "Insulin Estimate & IOB Disclosure",
        notice: "Insulin activity, insulin-on-board, dose-overlap, and related values shown by Stackd are estimates based on the insulin doses, times, insulin profiles, and settings recorded in the app.\n\nActual insulin action can vary between individuals and can vary within the same person. Incorrect, incomplete, delayed, or duplicated entries may produce inaccurate estimates.",
        checkboxId: "insulin_estimate_notice_accepted",
        checkboxLabel: "I understand that insulin activity and insulin-on-board values shown by Stackd are estimates and may not reflect my actual insulin activity.",
      },
      {
        title: "User-Entered Insulin Settings",
        notice: "Only enter insulin settings, including insulin-to-carbohydrate ratio, correction factor, glucose target, insulin duration, and insulin profile information, that have been established or reviewed with a qualified healthcare professional.",
        checkboxId: "insulin_settings_notice_accepted",
        checkboxLabel: "I confirm that I am responsible for verifying the insulin settings I enter and that Stackd does not determine whether those settings are safe or appropriate for me.",
      },
    ],
  },
  {
    id: 4,
    key: "notifications-health",
    label: "Notifications & Data",
    sections: [
      {
        title: "Notification Limitations",
        notice: "Stackd notifications are supplemental reminders only. Notifications may be delayed, suppressed, disabled, or not delivered because of device settings, connectivity, battery status, operating-system behavior, service interruptions, or other factors.\n\nNever rely on Stackd as the sole method of detecting or treating a high glucose level, low glucose level, missed dose, insulin overlap, or another medical event.",
        checkboxId: "notification_notice_accepted",
        checkboxLabel: "I understand that Stackd notifications are not guaranteed and must not be relied upon as my sole safety system.",
      },
      {
        title: "Sensitive Health-Data Consent",
        notice: "Stackd may collect and process user-provided health information, including:\n\n\u2022 Glucose values\n\u2022 Insulin doses and timing\n\u2022 Insulin types and profiles\n\u2022 Carbohydrate intake\n\u2022 Meal information\n\u2022 Health-related notes\n\u2022 Imported health-device data, if connected\n\u2022 App-generated estimates and trends",
        checkboxId: "health_data_consent_accepted",
        checkboxLabel: "I consent to Stackd collecting and processing the health information I choose to enter or connect for the purpose of providing the app's features.",
      },
    ],
  },
  {
    id: 5,
    key: "review",
    label: "Review & Accept",
  },
];

export const LEGAL_DOCUMENTS = {
  terms: {
    title: "Terms of Use",
    version: ACKNOWLEDGMENT_VERSIONS.terms_version,
    content: `[PLACEHOLDER — Replace with attorney-reviewed language before production launch.]

Last updated: July 4, 2026 · Version ${ACKNOWLEDGMENT_VERSIONS.terms_version}

1. Acceptance of Terms
By creating an account and using Stackd ("the Service"), you agree to be bound by these Terms of Use. If you do not agree, do not use the Service.

2. Description of Service
Stackd is a wellness-focused application that helps users record and visualize information related to glucose, carbohydrates, and insulin use. The Service does not provide medical advice, diagnosis, or treatment.

3. No Medical Advice
Stackd is not a medical device and does not provide medical advice. Always consult a qualified healthcare professional regarding treatment decisions. Do not start, stop, or change insulin, medication, carbohydrate treatment, or other medical care solely because of information displayed by Stackd.

4. Emergency Disclaimer
Stackd is not an emergency service and does not continuously monitor your condition. If you experience a medical emergency, seek immediate medical assistance.

5. User Responsibilities
You are responsible for the accuracy of information you enter. You are responsible for verifying that any insulin settings are appropriate for you, as established with your healthcare professional.

6. Insulin Estimates
Insulin activity, insulin-on-board, and related values are estimates. Actual insulin action can vary. Incorrect or incomplete entries may produce inaccurate estimates.

7. Data and Privacy
Your use of the Service is also governed by the Stackd Privacy Notice. Health data you enter is processed for the purpose of providing the Service's features.

8. Notification Limitations
Stackd notifications are supplemental reminders only and may not be delivered. Never rely on Stackd as your sole safety system.

9. Limitation of Liability
Stackd is provided "as is" without warranties of any kind. To the fullest extent permitted by law, Stackd shall not be liable for any damages arising from your use of the Service.

10. Changes to Terms
We may update these Terms from time to time. Material changes will require you to re-acknowledge before continued use.

11. Contact
For questions about these Terms, please contact Stackd support.`,
  },
  privacy: {
    title: "Privacy Notice",
    version: ACKNOWLEDGMENT_VERSIONS.privacy_notice_version,
    content: `[PLACEHOLDER — Replace with attorney-reviewed language before production launch.]

Last updated: July 4, 2026 · Version ${ACKNOWLEDGMENT_VERSIONS.privacy_notice_version}

1. Information We Collect
Stackd collects and processes health information you choose to enter, including:
  - Glucose values
  - Insulin doses and timing
  - Insulin types and profiles
  - Carbohydrate intake
  - Meal information
  - Health-related notes
  - Imported health-device data, if connected
  - App-generated estimates and trends

We also collect technical metadata such as device type, locale, and timezone when you complete acknowledgment requirements.

2. How We Use Your Information
Your health information is used to provide the Service's features, including displaying glucose trends, insulin activity estimates, and meal balance insights.

3. Data Storage and Security
Your data is encrypted in transit and at rest. Only you can access your health records. We do not share, sell, or transmit your personal health information to third parties.

4. Data Retention
Your health data remains stored as long as your account is active. You can export or delete your data at any time from Settings.

5. Consent and Withdrawal
Your consent to health data processing is required to use the Service. You may withdraw consent at any time, which will restrict access to health-related features. Withdrawing consent does not automatically delete your existing data.

6. Acknowledgment Records
We maintain immutable records of your acknowledgment acceptances, including the versions of documents you agreed to and when you agreed to them. These records are retained for compliance purposes.

7. No Marketing or Third-Party Sharing
We do not use your health data for marketing, research, or advertising purposes. We do not share your health data with third parties.

8. Changes to This Notice
We may update this Privacy Notice from time to time. Material changes will require you to re-acknowledge before continued use.

9. Contact
For questions about this Privacy Notice, please contact Stackd support.`,
  },
};