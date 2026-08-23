Cheyyar Hub - Phone OTP Auth Update

Files:
- App.jsx: updated Phone OTP authentication and existing app preserved
- App.css: OTP/reCAPTCHA styling
- firebase.js: your existing Firebase config copied unchanged

Important:
1. Keep your existing logo.png in the src folder because App.jsx imports it.
2. Firebase Authentication -> Sign-in method -> Phone must be enabled.
3. Firebase Authentication -> Settings -> Authorized domains must include your deployed domain.
4. Existing users whose phone number is already linked to their Firebase Auth account keep the same UID.
5. A phone number that is NOT linked to an existing Developer Firebase account will create a new UID. Do not delete the existing Developer Auth user.
