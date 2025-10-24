import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import colors from '../../../styles/Colors';

const AddBranchScreen = () => {

  return (
    <View style={styles.container}>
        <Text style={{alignSelf:"center", marginTop:"90%"}}> this is AddBranchScreen</Text>
    </View>
  );
};

export default AddBranchScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },});
