import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000'
).replace(/\/$/, '');

async function api(path, method = 'GET', body, token) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

// IMPORTANT: Keep components outside App to prevent input focus loss.

function Field({
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#8b879b"
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      style={styles.input}
    />
  );
}

function Button({ title, onPress, secondary = false, disabled = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          secondary && styles.secondaryButtonText,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export default function App() {
  const [screen, setScreen] = useState('login');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const [token, setToken] = useState('');
  const [challenge, setChallenge] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');

  const [user, setUser] = useState(null);
  const [textValue, setTextValue] = useState(
    'Confidential class project information'
  );

  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action) {
    if (busy) return;

    setBusy(true);
    setResult('');

    try {
      await action();
    } catch (error) {
      const message = error.message || 'Something went wrong.';

      if (typeof window !== 'undefined' && window.alert) {
        window.alert(message);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    setToken('');
    setChallenge('');
    setSetupToken('');
    setUser(null);
    setCode('');
    setResult('');
    setScreen('login');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logo}>
          <Text style={styles.logoText}>S</Text>
        </View>

        <Text style={styles.brand}>SecureAccess</Text>
        <Text style={styles.subtitle}>
          Mobile Application Security
        </Text>

        {busy && (
          <ActivityIndicator
            size="large"
            color="#6d28d9"
            style={{ marginBottom: 15 }}
          />
        )}

        {/* LOGIN SCREEN */}

        {screen === 'login' && (
          <>
            <Text style={styles.heading}>Welcome back</Text>

            <Text style={styles.muted}>
              Sign in to your secure account.
            </Text>

            <Field
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              keyboardType="email-address"
            />

            <Field
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
            />

            <Button
              title="Sign in"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  const data = await api('/api/auth/login', 'POST', {
                    email,
                    password,
                  });

                  if (data.requires2FA) {
                    setChallenge(data.challengeToken);
                    setScreen('verify');
                  } else if (data.requires2FASetup) {
                    setSetupToken(data.setupToken);
                    setOtpauthUrl(data.otpauthUrl || '');
                    setScreen('setup2fa');
                  }
                })
              }
            />

            <Button
              title="Create an account"
              secondary
              disabled={busy}
              onPress={() => setScreen('register')}
            />
          </>
        )}

        {/* REGISTRATION SCREEN */}

        {screen === 'register' && (
          <>
            <Text style={styles.heading}>Create account</Text>

            <Text style={styles.muted}>
              New accounts receive standard-user permissions.
            </Text>

            <Field
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              autoCapitalize="words"
            />

            <Field
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              keyboardType="email-address"
            />

            <Field
              value={password}
              onChangeText={setPassword}
              placeholder="Password (minimum 12 characters)"
              secureTextEntry
            />

            <Button
              title="Register securely"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  const data = await api('/api/auth/register', 'POST', {
                    name,
                    email,
                    password,
                  });

                  window.alert(data.message);
                  setScreen('login');
                })
              }
            />

            <Button
              title="Back to login"
              secondary
              disabled={busy}
              onPress={() => setScreen('login')}
            />
          </>
        )}

        {/* TWO-FACTOR SETUP */}

        {screen === 'setup2fa' && (
          <>
            <Text style={styles.heading}>Set up two-factor authentication</Text>

            <Text style={styles.muted}>
              Add the account below to an authenticator app and enter its
              current six-digit code.
            </Text>

            <View style={styles.uriBox}>
              <Text selectable style={styles.uriText}>
                {otpauthUrl}
              </Text>
            </View>

            <Field
              value={code}
              onChangeText={setCode}
              placeholder="Six-digit code"
              keyboardType="number-pad"
            />

            <Button
              title="Enable 2FA"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  const data = await api(
                    '/api/auth/enable-2fa',
                    'POST',
                    { setupToken, code }
                  );

                  window.alert(data.message);

                  setCode('');
                  setSetupToken('');
                  setScreen('login');
                })
              }
            />

            <Button
              title="Cancel"
              secondary
              disabled={busy}
              onPress={() => setScreen('login')}
            />
          </>
        )}

        {/* TWO-FACTOR VERIFICATION */}

        {screen === 'verify' && (
          <>
            <Text style={styles.heading}>Verify your identity</Text>

            <Text style={styles.muted}>
              Enter the six-digit code from your authenticator app.
            </Text>

            <Field
              value={code}
              onChangeText={setCode}
              placeholder="Six-digit code"
              keyboardType="number-pad"
            />

            <Button
              title="Verify and continue"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  const data = await api(
                    '/api/auth/verify-2fa',
                    'POST',
                    {
                      challengeToken: challenge,
                      code,
                    }
                  );

                  setToken(data.token);
                  setUser(data.user);
                  setChallenge('');
                  setCode('');
                  setScreen('home');
                })
              }
            />

            <Button
              title="Cancel"
              secondary
              disabled={busy}
              onPress={() => setScreen('login')}
            />
          </>
        )}

        {/* DASHBOARD */}

        {screen === 'home' && (
          <>
            <Text style={styles.heading}>
              Hello, {user?.name || 'User'}
            </Text>

            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>
                {user?.role || 'USER'}
              </Text>
            </View>

            <Text style={styles.muted}>
              Your account is authenticated. The server controls your
              permissions.
            </Text>

            <Button
              title="View my profile"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  const data = await api('/api/me', 'GET', null, token);
                  setResult(JSON.stringify(data, null, 2));
                })
              }
            />

            <Button
              title="Open user area"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  const data = await api(
                    '/api/user/overview',
                    'GET',
                    null,
                    token
                  );

                  setResult(JSON.stringify(data, null, 2));
                })
              }
            />

            <Button
              title="Try administrator area"
              secondary
              disabled={busy}
              onPress={() =>
                run(async () => {
                  const data = await api(
                    '/api/admin/overview',
                    'GET',
                    null,
                    token
                  );

                  setResult(JSON.stringify(data, null, 2));
                })
              }
            />

            <Text style={styles.headingSmall}>
              Encryption demonstration
            </Text>

            <Field
              value={textValue}
              onChangeText={setTextValue}
              placeholder="Enter text to encrypt"
              autoCapitalize="sentences"
            />

            <Button
              title="Encrypt with AES-256-GCM"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  const data = await api(
                    '/api/security/encrypt',
                    'POST',
                    { text: textValue },
                    token
                  );

                  setResult(JSON.stringify(data, null, 2));
                })
              }
            />

            <Button
              title="Generate integrity HMAC"
              secondary
              disabled={busy}
              onPress={() =>
                run(async () => {
                  const data = await api(
                    '/api/security/integrity',
                    'POST',
                    { text: textValue },
                    token
                  );

                  setResult(JSON.stringify(data, null, 2));
                })
              }
            />

            {result !== '' && (
              <View style={styles.resultBox}>
                <Text selectable style={styles.resultText}>
                  {result}
                </Text>
              </View>
            )}

            <Button
              title="Sign out"
              secondary
              disabled={busy}
              onPress={logout}
            />
          </>
        )}

        <Text style={styles.footer}>
          SecureAccess · Mobile Application Security Project
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f7f5ff',
  },

  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 28,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },

  logo: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#6d28d9',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 10,
  },

  logoText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
  },

  brand: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    color: '#241044',
  },

  subtitle: {
    textAlign: 'center',
    color: '#77718b',
    marginTop: 4,
    marginBottom: 28,
  },

  heading: {
    fontSize: 25,
    fontWeight: '800',
    color: '#241044',
    marginBottom: 6,
  },

  headingSmall: {
    fontSize: 18,
    fontWeight: '800',
    color: '#241044',
    marginTop: 20,
    marginBottom: 8,
  },

  muted: {
    color: '#77718b',
    lineHeight: 21,
    marginBottom: 16,
  },

  input: {
    backgroundColor: '#fff',
    borderColor: '#e4def5',
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 15,
    color: '#241044',
    marginBottom: 12,
  },

  button: {
    backgroundColor: '#6d28d9',
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },

  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  secondaryButton: {
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },

  secondaryButtonText: {
    color: '#5b21b6',
  },

  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ede9fe',
    borderRadius: 30,
    paddingHorizontal: 13,
    paddingVertical: 7,
    marginVertical: 12,
  },

  roleText: {
    color: '#5b21b6',
    fontWeight: '800',
    fontSize: 12,
  },

  uriBox: {
    padding: 12,
    backgroundColor: '#fff',
    borderColor: '#e4def5',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 18,
  },

  uriText: {
    color: '#5b21b6',
    fontSize: 12,
    lineHeight: 18,
  },

  resultBox: {
    backgroundColor: '#201536',
    padding: 14,
    borderRadius: 12,
    marginVertical: 12,
  },

  resultText: {
    color: '#f5f3ff',
    fontSize: 12,
    lineHeight: 18,
  },

  footer: {
    color: '#9b95ac',
    textAlign: 'center',
    fontSize: 11,
    marginTop: 28,
    marginBottom: 12,
  },
});