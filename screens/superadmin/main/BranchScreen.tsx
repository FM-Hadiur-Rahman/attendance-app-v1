import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import colors from '../../../styles/Colors';

const BranchScreen = () => {

  return (
    <View style={styles.container}>
        <Text style={{alignSelf:"center", marginTop:"90%"}}> this is BranchScreen</Text>
    </View>
  );
};

export default BranchScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },});
