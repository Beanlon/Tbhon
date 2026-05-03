import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type Stat = {
  value: string;
  label: string;
  color: string;
};

type Tag = {
  label: string;
  backgroundColor: string;
  color: string;
};

type Symptom = {
  name: string;
  note: string;
  dotColor: string;
};

type Step = {
  number: string;
  title: string;
  description: string;
  backgroundColor: string;
};

const overviewStats: Stat[] = [
  { value: '1.3M', label: 'Deaths globally per year', color: '#E53935' },
  { value: '10M', label: 'People fall ill yearly', color: '#E67E22' },
  { value: '85%', label: 'Cure rate with treatment', color: '#1E8449' },
];

const spreadTags: Tag[] = [
  { label: 'Airborne', backgroundColor: '#E6F3FB', color: '#1D6FA4' },
  { label: 'Close contact', backgroundColor: '#FEF5E7', color: '#E67E22' },
  { label: 'Coughing / sneezing', backgroundColor: '#FDEDEC', color: '#C0392B' },
  { label: 'Talking', backgroundColor: '#E6F3FB', color: '#1D6FA4' },
  { label: 'Singing', backgroundColor: '#E6F3FB', color: '#1D6FA4' },
];

const riskTags: Tag[] = [
  { label: 'HIV positive', backgroundColor: '#FDEDEC', color: '#C0392B' },
  { label: 'Malnutrition', backgroundColor: '#FDEDEC', color: '#C0392B' },
  { label: 'Diabetes', backgroundColor: '#FEF5E7', color: '#E67E22' },
  { label: 'Smokers', backgroundColor: '#FEF5E7', color: '#E67E22' },
  { label: 'Overcrowded spaces', backgroundColor: '#FEF5E7', color: '#E67E22' },
  { label: 'Healthcare workers', backgroundColor: '#E6F3FB', color: '#1D6FA4' },
  { label: 'Elderly & children', backgroundColor: '#E6F3FB', color: '#1D6FA4' },
];

const symptoms: Symptom[] = [
  { name: 'Persistent cough', note: '3+ weeks', dotColor: '#C0392B' },
  { name: 'Coughing up blood', note: 'Seek help now', dotColor: '#E67E22' },
  { name: 'Night sweats', note: 'Recurring', dotColor: '#E67E22' },
  { name: 'Unexplained weight loss', note: 'Rapid drop', dotColor: '#1D6FA4' },
  { name: 'Fatigue & weakness', note: 'Prolonged', dotColor: '#1D6FA4' },
  { name: 'Fever & chills', note: 'Low-grade', dotColor: '#1D6FA4' },
  { name: 'Chest pain', note: 'When breathing', dotColor: '#1D6FA4' },
];

const steps: Step[] = [
  {
    number: '1',
    title: 'See a doctor immediately',
    description: 'Do not wait. Visit a health center for a proper evaluation if you have a cough lasting 3+ weeks.',
    backgroundColor: '#1D6FA4',
  },
  {
    number: '2',
    title: 'Get tested',
    description: 'A sputum test, chest X-ray, or skin test can confirm or rule out TB.',
    backgroundColor: '#E67E22',
  },
  {
    number: '3',
    title: 'Take medications as prescribed',
    description: 'TB treatment takes 6–9 months. Stopping early can lead to drug-resistant TB.',
    backgroundColor: '#1E8449',
  },
  {
    number: '4',
    title: 'Isolate while contagious',
    description: 'Stay home, use masks, and avoid crowded places in the early weeks of treatment.',
    backgroundColor: '#0a1428',
  },
  {
    number: '5',
    title: 'Notify close contacts',
    description: 'People who live with you or spend long hours nearby should also get tested.',
    backgroundColor: '#C0392B',
  },
];

const prevention: Step[] = [
  {
    number: '💉',
    title: 'BCG vaccine',
    description: 'Given at birth, it helps protect infants from severe forms of TB.',
    backgroundColor: '#1D6FA4',
  },
  {
    number: '😷',
    title: 'Wear masks in crowded areas',
    description: 'N95 or surgical masks reduce airborne transmission risk significantly.',
    backgroundColor: '#1D6FA4',
  },
  {
    number: '🌬️',
    title: 'Ensure good ventilation',
    description: 'Open windows and use fans to reduce TB bacteria concentration indoors.',
    backgroundColor: '#1D6FA4',
  },
  {
    number: '🥗',
    title: 'Support your immune system',
    description: 'Eat nutritious food, sleep well, and avoid smoking to stay strong.',
    backgroundColor: '#1D6FA4',
  },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.1,
        color: '#8FA3B1',
        textTransform: 'uppercase',
        marginBottom: '-2%',
      }}
    >
      {children}
    </Text>
  );
}

function InfoCard({
  icon,
  iconBackground,
  title,
  subtitle,
  children,
}: {
  icon: string;
  iconBackground: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: '5%',
        borderWidth: 1,
        borderColor: '#efefef',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: '4%' }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: iconBackground,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 18 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111111' }}>{title}</Text>
          <Text style={{ fontSize: 11, color: '#8FA3B1', marginTop: 2 }}>{subtitle}</Text>
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: '#efefef', marginBottom: '4%' }} />
      {children}
    </View>
  );
}

function TagPill({ label, backgroundColor, color }: Tag) {
  return (
    <View
      style={{
        paddingVertical: '1.7%',
        paddingHorizontal: '3.4%',
        borderRadius: 999,
        backgroundColor,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color }}>{label}</Text>
    </View>
  );
}

function BulletStat({ value, label, color }: Stat) {
  return (
    <View style={{ flex: 1, backgroundColor: '#f8f8f8', borderRadius: 12, paddingVertical: '4%', paddingHorizontal: '2.5%', alignItems: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 10, color: '#8FA3B1', marginTop: 4, textAlign: 'center', lineHeight: 14 }}>{label}</Text>
    </View>
  );
}

function StepRow({ number, title, description, backgroundColor }: Step) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#111111' }}>{title}</Text>
        <Text style={{ fontSize: 12, color: '#5D6D7E', lineHeight: 18, marginTop: 2 }}>{description}</Text>
      </View>
    </View>
  );
}

function AlertBanner({
  tone,
  icon,
  title,
  description,
}: {
  tone: 'warn' | 'danger' | 'green';
  icon: string;
  title: string;
  description: string;
}) {
  const colors = {
    warn: { backgroundColor: '#FEF5E7', borderColor: '#E67E22', textColor: '#7D4E00' },
    danger: { backgroundColor: '#FDEDEC', borderColor: '#C0392B', textColor: '#7B241C' },
    green: { backgroundColor: '#E9F7EF', borderColor: '#1E8449', textColor: '#1A6035' },
  }[tone];

  return (
    <View
      style={{
        backgroundColor: colors.backgroundColor,
        borderLeftWidth: 3,
        borderLeftColor: colors.borderColor,
        borderRadius: 10,
        padding: '4%',
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <Text style={{ fontSize: 16, marginTop: 1 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textColor, marginBottom: 2 }}>{title}</Text>
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.textColor }}>{description}</Text>
      </View>
    </View>
  );
}

export function LearnContent() {
  const router = useRouter();

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: '2%' }}>
      <View style={{ paddingHorizontal: '5.5%', paddingTop: '18%', paddingBottom: '3%' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4%' }}>
          <View>
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>📚 Learn</Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#000' }}>Tuberculosis (TB)</Text>
          </View>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#d8d8d8', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 26 }}>🫁</Text>
          </View>
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: '5%', borderWidth: 1, borderColor: '#efefef', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: '#E6F3FB', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ionicons name="medkit-outline" size={26} color="#1D6FA4" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#111111', lineHeight: 22 }}>
              A curable bacterial infection - understand it, prevent it, and act early.
            </Text>
            <Text style={{ fontSize: 12, color: '#5D6D7E', lineHeight: 18, marginTop: 4 }}>
              Keep the same clean card styling used throughout the home screen while learning the essentials.
            </Text>
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: '5.5%', gap: 16 }}>
        <SectionLabel>Overview</SectionLabel>
        <InfoCard icon="🔬" iconBackground="#E6F3FB" title="What is Tuberculosis?" subtitle="Basic definition">
          <Text style={{ fontSize: 13, color: '#5D6D7E', lineHeight: 21, marginBottom: '4%' }}>
            TB is a contagious disease caused by the bacterium <Text style={{ fontWeight: '700', color: '#111111' }}>Mycobacterium tuberculosis</Text>. It mainly affects the lungs, but it can spread to other organs including the kidneys, spine, and brain.
          </Text>
          <View style={{ flexDirection: 'row', gap: '2.5%' }}>
            {overviewStats.map((item) => (
              <BulletStat key={item.label} {...item} />
            ))}
          </View>
        </InfoCard>

        <SectionLabel>Causes</SectionLabel>
        <InfoCard icon="💨" iconBackground="#FEF5E7" title="How TB Spreads" subtitle="Transmission routes">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: '4%' }}>
            {spreadTags.map((tag) => (
              <TagPill key={tag.label} {...tag} />
            ))}
          </View>
          <AlertBanner tone="warn" icon="⚠️" title="Not spread by touch" description="TB is not transmitted through handshakes, sharing food, kissing, or touching surfaces. It spreads only through the air." />
        </InfoCard>

        <InfoCard icon="⚡" iconBackground="#FDEDEC" title="Who is at Higher Risk?" subtitle="Vulnerability factors">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {riskTags.map((tag) => (
              <TagPill key={tag.label} {...tag} />
            ))}
          </View>
        </InfoCard>

        <SectionLabel>Symptoms</SectionLabel>
        <InfoCard icon="🩺" iconBackground="#FDEDEC" title="Signs & Symptoms" subtitle="Watch for these warning signs">
          <View style={{ gap: 8 }}>
            {symptoms.map((symptom) => (
              <View key={symptom.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: '2.7%', paddingHorizontal: '3.5%', backgroundColor: '#f8f8f8', borderRadius: 10 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: symptom.dotColor, flexShrink: 0 }} />
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#111111' }}>{symptom.name}</Text>
                <Text style={{ fontSize: 11, color: '#8FA3B1' }}>{symptom.note}</Text>
              </View>
            ))}
          </View>
        </InfoCard>

        <InfoCard icon="🔄" iconBackground="#E9F7EF" title="Latent vs Active TB" subtitle="Two very different states">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, backgroundColor: '#E9F7EF', borderRadius: 10, padding: '4%' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E8449', marginBottom: 6 }}>Latent TB</Text>
              <Text style={{ fontSize: 11, color: '#1A6035', lineHeight: 18 }}>• No symptoms{"\n"}• Not contagious{"\n"}• Bacteria inactive{"\n"}• Can become active</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#FDEDEC', borderRadius: 10, padding: '4%' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#C0392B', marginBottom: 6 }}>Active TB</Text>
              <Text style={{ fontSize: 11, color: '#7B241C', lineHeight: 18 }}>• Symptoms present{"\n"}• Contagious to others{"\n"}• Bacteria active{"\n"}• Requires treatment</Text>
            </View>
          </View>
        </InfoCard>

        <SectionLabel>What To Do</SectionLabel>
        <InfoCard icon="✅" iconBackground="#E9F7EF" title="Steps to Take" subtitle="If you suspect TB">
          <View style={{ gap: 12 }}>
            {steps.map((step) => (
              <StepRow key={step.title} {...step} />
            ))}
          </View>
        </InfoCard>

        <SectionLabel>Prevention</SectionLabel>
        <InfoCard icon="🛡️" iconBackground="#E9F7EF" title="How to Prevent TB" subtitle="Protect yourself and others">
          <View style={{ gap: 12 }}>
            {prevention.map((item) => (
              <StepRow key={item.title} {...item} />
            ))}
          </View>
        </InfoCard>

        <AlertBanner tone="danger" icon="🚨" title="Seek emergency care if..." description="You cough up blood, experience severe chest pain, or have difficulty breathing. These are signs of advanced TB requiring urgent medical attention." />

        <AlertBanner tone="green" icon="💚" title="Good news - TB is curable!" description="With complete and consistent treatment, the vast majority of people fully recover from TB." />

        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/screening/recording')} style={{ backgroundColor: '#0a1428', borderRadius: 16, paddingVertical: '4.5%', paddingHorizontal: '5%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: '2%', marginBottom: '4%' }}>
          <View>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Find a TB Testing Center</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 3 }}>Locate the nearest health facility</Text>
          </View>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 16 }}>→</Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
