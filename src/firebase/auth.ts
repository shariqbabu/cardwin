export const signUp = async (
  email: string, password: string,
  name: string, phone: string, referralCode?: string
) => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;
  await updateProfile(user, { displayName: name });

  // ✅ Server API call — Admin SDK se likhega
  const token = await user.getIdToken();
  await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
                Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uid: user.uid, name, email, phone, referralCode }),
  });

  return user;
};
