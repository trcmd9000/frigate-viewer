import React, {useCallback, useEffect, useState} from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import {useAppSelector, useAppDispatch} from '../store/store';
import {selectServers, setServerClientCertConfig} from '../store/settings';
import {
  clientCertManager,
  CertificateListItem,
} from '../helpers/clientCertificates';
import {CertificateInfo} from '../store/settings';

interface ClientCertSettingsProps {
  serverIndex: number;
  onClose?: () => void;
}

/**
 * Component for selecting and configuring client certificates for a Frigate server.
 * Displays certificate details, expiry dates, and warnings.
 */
export const ClientCertSettings: React.FC<ClientCertSettingsProps> = ({
  serverIndex,
  onClose,
}) => {
  const dispatch = useAppDispatch();
  const servers = useAppSelector(selectServers);
  const server = servers[serverIndex];

  const [certificates, setCertificates] = useState<CertificateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCert, setSelectedCert] = useState<string | undefined>(
    server?.clientCertConfig?.alias,
  );
  const [selectedCertDetails, setSelectedCertDetails] = useState<
    CertificateInfo | undefined
  >();
  const [password, setPassword] = useState<string | undefined>(
    server?.clientCertConfig?.password,
  );
  const [allowSelfSignedServer, setAllowSelfSignedServer] = useState<boolean>(
    server?.clientCertConfig?.allowSelfSignedServer || false,
  );
  const [loadingDetails, setLoadingDetails] = useState(false);

  const loadCertificates = useCallback(
    () => clientCertManager.listCertificates(),
    [],
  );

  useEffect(() => {
    let isMounted = true;

    loadCertificates()
      .then(certs => {
        if (isMounted) {
          setCertificates(certs);
        }
      })
      .catch(error => {
        console.error('Error loading certificates:', error);
        Alert.alert(
          'Error',
          'Failed to load certificates from device. Make sure you have installed a client certificate.',
        );
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [loadCertificates]);

  // Load certificate details when selected certificate changes
  useEffect(() => {
    if (!selectedCert) {
      setSelectedCertDetails(undefined);
      return;
    }

    let isMounted = true;
    setLoadingDetails(true);

    clientCertManager
      .getCertificateDetails(selectedCert)
      .then(details => {
        if (isMounted && details) {
          setSelectedCertDetails(details);
        }
      })
      .catch(error => {
        console.error('Error loading certificate details:', error);
        if (isMounted) {
          setSelectedCertDetails(undefined);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingDetails(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCert]);

  const handleSaveCertConfig = () => {
    if (!selectedCert) {
      Alert.alert('Error', 'Please select a certificate');
      return;
    }

    dispatch(
      setServerClientCertConfig({
        serverIndex,
        clientCertConfig: {
          alias: selectedCert,
          password: password || undefined,
          allowSelfSignedServer,
        },
      }),
    );

    Alert.alert('Success', 'Client certificate configuration saved', [
      {text: 'OK', onPress: onClose},
    ]);
  };

  const handleClearCertConfig = () => {
    dispatch(
      setServerClientCertConfig({
        serverIndex,
        clientCertConfig: undefined,
      }),
    );
    setSelectedCert(undefined);
    setPassword(undefined);
    setSelectedCertDetails(undefined);
    Alert.alert('Success', 'Client certificate configuration cleared', [
      {text: 'OK', onPress: onClose},
    ]);
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const renderCertificateDetails = () => {
    if (!selectedCertDetails || loadingDetails) {
      return null;
    }

    const expiryStatus = clientCertManager.getExpiryStatus(
      new Date(selectedCertDetails.notAfter),
    );
    const isExpired = expiryStatus.isExpired;
    const daysUntilExpiry = expiryStatus.daysUntilExpiry;

    return (
      <View style={styles.detailsSection}>
        <Text style={styles.detailsTitle}>Certificate Details</Text>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Subject (CN):</Text>
          <Text style={styles.detailValue}>
            {selectedCertDetails.subjectDN || 'N/A'}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Issued by:</Text>
          <Text style={styles.detailValue}>
            {selectedCertDetails.issuerDN || 'N/A'}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Valid from:</Text>
          <Text style={styles.detailValue}>
            {formatDate(new Date(selectedCertDetails.notBefore))}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Expires:</Text>
          <Text
            style={[
              styles.detailValue,
              isExpired && styles.expiredText,
              !isExpired && daysUntilExpiry < 30 && styles.expiringText,
            ]}
          >
            {formatDate(new Date(selectedCertDetails.notAfter))}
          </Text>
        </View>

        {expiryStatus.warningMessage && (
          <View
            style={[
              styles.warningBox,
              isExpired && styles.warningBoxExpired,
              !isExpired && daysUntilExpiry < 30 && styles.warningBoxExpiring,
            ]}
          >
            <Text
              style={[
                styles.warningBoxText,
                isExpired && styles.warningBoxTextExpired,
                !isExpired &&
                  daysUntilExpiry < 30 &&
                  styles.warningBoxTextExpiring,
              ]}
            >
              {expiryStatus.warningMessage}
            </Text>
          </View>
        )}

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Serial Number:</Text>
          <Text style={[styles.detailValue, styles.monospaceText]}>
            {selectedCertDetails.serialNumber}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Thumbprint:</Text>
          <Text style={[styles.detailValue, styles.monospaceText]}>
            {selectedCertDetails.thumbprint}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.title}>
          Client Certificate Configuration for "{server?.host}"
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Select Certificate:</Text>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0000ff" />
            <Text style={styles.loadingText}>Loading certificates...</Text>
          </View>
        ) : certificates.length === 0 ? (
          <View style={styles.noCertsContainer}>
            <Text style={styles.noCertsText}>
              No client certificates found on this device.
            </Text>
            <Text style={styles.noCertsSubtext}>
              Please install a client certificate in your device's
              keystore/keychain first.
            </Text>
          </View>
        ) : (
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedCert}
              onValueChange={setSelectedCert}
              style={styles.picker}
            >
              <Picker.Item
                label="-- Select a Certificate --"
                value={undefined}
              />
              {certificates.map((cert, index) => (
                <Picker.Item
                  key={index}
                  label={
                    cert.alias ||
                    cert.identity ||
                    cert.commonName ||
                    `Cert ${index + 1}`
                  }
                  value={cert.alias || cert.identity || `cert_${index}`}
                />
              ))}
            </Picker>
          </View>
        )}
      </View>

      {selectedCert && (
        <View style={styles.section}>
          <Text style={styles.infoText}>Selected: {selectedCert}</Text>
        </View>
      )}

      {loadingDetails && (
        <View style={styles.section}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#0000ff" />
            <Text style={styles.loadingText}>
              Loading certificate details...
            </Text>
          </View>
        </View>
      )}

      {renderCertificateDetails()}

      <View style={styles.section}>
        <View style={styles.checkboxContainer}>
          <Switch
            value={allowSelfSignedServer}
            onValueChange={setAllowSelfSignedServer}
            style={styles.switch}
          />
          <View style={styles.checkboxLabel}>
            <Text style={styles.checkboxText}>
              Allow Self-Signed Server Certificates
            </Text>
            <Text style={styles.warningText}>
              ⚠️ Only for test/private networks!
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.helpText}>
          ℹ️ The selected certificate will be used for mutual TLS (mTLS)
          authentication with the Frigate server. The certificate must be
          installed on your device before it can be used.
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <View style={[styles.button, styles.primaryButton]}>
          <Text style={styles.buttonText} onPress={handleSaveCertConfig}>
            Save Certificate Configuration
          </Text>
        </View>
        {server?.clientCertConfig && (
          <View style={[styles.button, styles.dangerButton]}>
            <Text style={styles.buttonText} onPress={handleClearCertConfig}>
              Clear Certificate Configuration
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  section: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  noCertsContainer: {
    padding: 16,
    alignItems: 'center',
  },
  noCertsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  noCertsSubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  picker: {
    height: 50,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  detailsSection: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  detailRow: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  monospaceText: {
    fontFamily: 'Courier New',
    fontSize: 12,
  },
  expiredText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  expiringText: {
    color: '#FF9500',
    fontWeight: '600',
  },
  warningBox: {
    marginVertical: 12,
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
  warningBoxExpired: {
    backgroundColor: '#F8D7DA',
    borderLeftColor: '#FF3B30',
  },
  warningBoxExpiring: {
    backgroundColor: '#FFF3CD',
    borderLeftColor: '#FF9500',
  },
  warningBoxText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
  },
  warningBoxTextExpired: {
    color: '#721C24',
  },
  warningBoxTextExpiring: {
    color: '#856404',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  switch: {
    marginRight: 12,
  },
  checkboxLabel: {
    flex: 1,
  },
  checkboxText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 14,
    color: '#ff6b35',
    fontWeight: '600',
  },
  helpText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  buttonContainer: {
    gap: 12,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
