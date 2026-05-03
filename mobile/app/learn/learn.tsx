import { LearnContent } from './LearnContent';
import BottomNav, { BottomNavTab } from '../components/BottomNav';

export default function LearnPage() {
  const router = useRouter();

  const handleTabPress = (tab: BottomNavTab) => {
    if (tab === 'home') {
      router.replace('/home/HomeScreen');
      return;
    }

    if (tab === 'learn') {
      return;
    }

    if (tab === 'profile') {
      router.push('/acountOptions/accountOptions');
      return;
    }

    if (tab === 'screening') {
      router.push('/screening/recording');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flex: 1 }}>
        <LearnContent />

        <BottomNav activeTab="learn" onTabPress={handleTabPress} />
      </View>
    </View>
  );
}
