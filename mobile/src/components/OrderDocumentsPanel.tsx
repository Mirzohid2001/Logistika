import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Linking, Share, Alert } from 'react-native';
import { Button } from './Button';
import { Card } from './Card';
import { ordersService } from '../services/ordersService';
import { useTranslation } from '../hooks/useTranslation';
import { OrderDocument } from '../types';
import { spacing, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';

type OrderDocumentsPanelProps = {
  orderId: number;
  documents?: OrderDocument[] | null;
  onDocumentsChange?: (documents: OrderDocument[]) => void;
};

const DOC_ORDER = ['invoice', 'ttn', 'cmr', 'act'] as const;

export const OrderDocumentsPanel: React.FC<OrderDocumentsPanelProps> = ({
  orderId,
  documents,
  onDocumentsChange,
}) => {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const items = useMemo(() => {
    const list = documents || [];
    return [...list].sort(
      (a, b) => DOC_ORDER.indexOf(a.doc_type as typeof DOC_ORDER[number]) - DOC_ORDER.indexOf(b.doc_type as typeof DOC_ORDER[number]),
    );
  }, [documents]);

  const generate = async (): Promise<OrderDocument[]> => {
    const result = await ordersService.generateOrderDocuments(orderId);
    onDocumentsChange?.(result);
    return result;
  };

  const ensureDocs = async (): Promise<OrderDocument[]> => {
    if (items.length) {
      return items;
    }
    return generate();
  };

  const openDoc = async (doc?: OrderDocument) => {
    try {
      setLoading(true);
      const list = doc ? items : await ensureDocs();
      const target = doc || list[0];
      if (!target?.html_url) {
        throw new Error('missing');
      }
      await Linking.openURL(target.html_url);
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('features.documents.openFailed'));
    } finally {
      setLoading(false);
    }
  };

  const shareFile = async (url?: string, title?: string, number?: string) => {
    if (!url) {
      throw new Error('missing');
    }
    await Share.share({
      message: `${title || ''} ${number || ''}\n${url}`.trim(),
      url,
    });
  };

  const sharePdf = async (doc: OrderDocument) => {
    try {
      setLoading(true);
      await shareFile(doc.has_pdf ? doc.pdf_url : doc.html_url, doc.title, doc.number);
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('features.documents.openFailed'));
    } finally {
      setLoading(false);
    }
  };

  const shareExcel = async (doc: OrderDocument) => {
    try {
      setLoading(true);
      await shareFile(doc.xlsx_url, doc.title, doc.number);
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.message || t('features.documents.openFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{t('features.documents.title')}</Text>
      <Text style={styles.hint}>{t('features.documents.subtitle')}</Text>
      {items.length === 0 ? (
        <Button
          title={t('features.documents.generate')}
          onPress={() => openDoc()}
          loading={loading}
          variant="outline"
          style={styles.button}
        />
      ) : (
        items.map((doc) => (
          <View key={doc.doc_type} style={styles.row}>
            <Text style={styles.docTitle}>
              {t(`features.documents.types.${doc.doc_type}`, { defaultValue: doc.title })}
            </Text>
            <Text style={styles.docNumber}>{doc.number}</Text>
            <Button
              title={t('features.documents.open')}
              onPress={() => openDoc(doc)}
              loading={loading}
              variant="outline"
              style={styles.smallButton}
            />
            <Button
              title={t('features.documents.pdf')}
              onPress={() => sharePdf(doc)}
              loading={loading}
              variant="outline"
              style={styles.smallButton}
            />
            <Button
              title={t('features.documents.excel')}
              onPress={() => shareExcel(doc)}
              loading={loading}
              variant="outline"
              style={styles.smallButton}
            />
          </View>
        ))
      )}
    </Card>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      marginBottom: spacing.md,
    },
    title: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.semibold,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    hint: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    row: {
      marginBottom: spacing.md,
    },
    docTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.medium,
      color: colors.text,
    },
    docNumber: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    button: {
      marginTop: spacing.xs,
    },
    smallButton: {
      marginTop: spacing.xs,
    },
  });
